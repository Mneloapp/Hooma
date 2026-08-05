export const GOOGLE_MAPS_AUTH_FAILURE_EVENT = "hooma:google-maps-auth-failure";
export const GOOGLE_MAPS_SCRIPT_ID = "hooma-google-maps-script";

type GoogleMapsNamespace = {
  importLibrary: (library: "maps") => Promise<{ Map: new (...args: any[]) => any }>;
};

type GoogleMapsWindow = Window & {
  google?: { maps?: GoogleMapsNamespace };
  gm_authFailure?: () => void;
  __hoomaGoogleMapsReady?: () => void;
  __hoomaGoogleMapsAuthHookInstalled?: boolean;
};

let mapsPromise: Promise<GoogleMapsNamespace> | null = null;
let failPendingLoad: ((message: string) => void) | null = null;
let authenticationFailed = false;

export function buildGoogleMapsScriptUrl(apiKey: string, language: "ka" | "en") {
  const params = new URLSearchParams({
    key: apiKey,
    loading: "async",
    callback: "__hoomaGoogleMapsReady",
    v: "weekly",
    language,
    region: "GE",
  });

  // Do not force auth_referrer_policy=origin. Hooma's recommended website
  // restrictions include /* paths; forcing an origin-only referrer makes those
  // otherwise valid restrictions fail with RefererNotAllowedMapError.
  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function installAuthenticationFailureHook(mapsWindow: GoogleMapsWindow) {
  if (mapsWindow.__hoomaGoogleMapsAuthHookInstalled) return;

  const previousHandler = mapsWindow.gm_authFailure;
  mapsWindow.gm_authFailure = () => {
    authenticationFailed = true;
    failPendingLoad?.("Google Maps authentication failed");
    mapsPromise = null;
    mapsWindow.dispatchEvent(new Event(GOOGLE_MAPS_AUTH_FAILURE_EVENT));
    previousHandler?.();
  };
  mapsWindow.__hoomaGoogleMapsAuthHookInstalled = true;
}

export function loadGoogleMaps(apiKey: string, language: "ka" | "en") {
  const mapsWindow = window as GoogleMapsWindow;
  installAuthenticationFailureHook(mapsWindow);

  if (authenticationFailed) {
    return Promise.reject(new Error("Google Maps authentication failed"));
  }
  if (mapsWindow.google?.maps?.importLibrary) {
    return Promise.resolve(mapsWindow.google.maps);
  }
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    let settled = false;
    const finish = (maps?: GoogleMapsNamespace) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      failPendingLoad = null;
      if (!maps?.importLibrary) {
        mapsPromise = null;
        reject(new Error("Google Maps loaded without the maps library"));
        return;
      }
      resolve(maps);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      failPendingLoad = null;
      mapsPromise = null;
      reject(new Error(message));
    };
    failPendingLoad = fail;
    const timeoutId = window.setTimeout(
      () => fail("Google Maps load timed out"),
      15_000,
    );

    mapsWindow.__hoomaGoogleMapsReady = () => finish(mapsWindow.google?.maps);

    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => fail("Google Maps script could not load"),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = buildGoogleMapsScriptUrl(apiKey, language);
    script.async = true;
    script.onerror = () => fail("Google Maps script could not load");
    document.head.appendChild(script);
  });

  return mapsPromise;
}
