const HOUSEHOLD_HERO_PATHNAME = "/homepage/household-category-hero.webp";
const HOUSEHOLD_CATEGORY_PATHNAME = "/shop/household";
const CATEGORY_HERO_PATH = /^\/homepage\/[a-z0-9-]+-category-hero\.webp$/;
const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const HERO_BROWSER_CONTRACT = Object.freeze({
  householdImagePathname: HOUSEHOLD_HERO_PATHNAME,
  householdCategoryPathname: HOUSEHOLD_CATEGORY_PATHNAME,
  sizes: "100vw",
  loading: "eager",
  fetchPriority: "high",
  width: 1774,
  height: 887,
});

function urlFor(value, base = "https://preview.invalid/") {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

export function pathnameFor(value, base) {
  return urlFor(value, base)?.pathname ?? "";
}

export function isCategoryHeroPathname(pathname) {
  return CATEGORY_HERO_PATH.test(pathname);
}

export function selectHouseholdHero(heroImages) {
  return heroImages.filter((image) => (
    pathnameFor(image.currentSrc || image.src, image.baseUrl) === HOUSEHOLD_HERO_PATHNAME
    && pathnameFor(image.linkHref, image.baseUrl) === HOUSEHOLD_CATEGORY_PATHNAME
  ));
}

export function assertHeroContract(snapshot) {
  const household = selectHouseholdHero(snapshot.heroImages ?? []);
  if (household.length !== 1) {
    throw new Error(`household hero selector expected 1 match, received ${household.length}`);
  }

  const initial = household[0];
  const expected = HERO_BROWSER_CONTRACT;
  const checks = [
    [initial.sizes === expected.sizes, `household hero sizes must be ${expected.sizes}`],
    [initial.loading === expected.loading, `household hero loading must be ${expected.loading}`],
    [initial.fetchPriority === expected.fetchPriority, `household hero fetchpriority must be ${expected.fetchPriority}`],
    [Number(initial.width) === expected.width, `household hero width must be ${expected.width}`],
    [Number(initial.height) === expected.height, `household hero height must be ${expected.height}`],
    [initial.slideIndex === 0, "household hero must be the initial slide"],
    [initial.slideAriaHidden === "false", "household hero must be the initially active slide"],
  ];
  for (const [passed, message] of checks) {
    if (!passed) throw new Error(message);
  }

  const deferred = (snapshot.heroImages ?? []).filter((image) => image !== initial);
  if (deferred.length === 0) throw new Error("at least one deferred category hero is required");
  if (deferred.some((image) => image.loading !== "lazy" || image.fetchPriority !== "auto")) {
    throw new Error("all non-initial category heroes must be lazy with auto fetch priority");
  }
  return initial;
}

function relevantResourceKind(url, resourceType) {
  if (resourceType === "document") return "document";
  if (resourceType === "script" || url.pathname.endsWith(".js")) return "js";
  if (resourceType === "stylesheet" || url.pathname.endsWith(".css")) return "css";
  if (
    url.searchParams.has("_rsc")
    || url.pathname.endsWith(".rsc")
    || resourceType === "fetch"
    || resourceType === "xhr"
  ) return "rsc";
  return null;
}

export function createSameOriginResponseRecorder(expectedHostname) {
  const expected = expectedHostname.toLowerCase();
  const events = [];

  return {
    record({ url: value, status, resourceType }) {
      const url = urlFor(value);
      if (!url || url.hostname.toLowerCase() !== expected) return;
      const kind = relevantResourceKind(url, resourceType);
      if (!kind) return;
      events.push({ kind, status: Number(status) });
    },
    summary() {
      const result = { document: {}, js: {}, css: {}, rsc: {}, challenge302: 0 };
      for (const event of events) {
        const bucket = result[event.kind];
        const key = String(event.status);
        bucket[key] = (bucket[key] ?? 0) + 1;
        if (event.status === 302 && event.kind !== "document") result.challenge302 += 1;
      }
      return result;
    },
  };
}

export function attachSameOriginResponseRecorder(page, expectedHostname) {
  const recorder = createSameOriginResponseRecorder(expectedHostname);
  page.on("response", (response) => {
    recorder.record({
      url: response.url(),
      status: response.status(),
      resourceType: response.request().resourceType(),
    });
  });
  return recorder;
}

function successfulStatusCount(bucket = {}) {
  return Object.entries(bucket).reduce((total, [status, count]) => (
    Number(status) >= 200 && Number(status) < 300 ? total + Number(count) : total
  ), 0);
}

export function sessionReadinessIssues(snapshot, expectedHostname) {
  const issues = [];
  const finalUrl = urlFor(snapshot.finalUrl);
  if (snapshot.httpStatus < 200 || snapshot.httpStatus >= 300) {
    issues.push(`initial document returned HTTP ${snapshot.httpStatus}`);
  }
  if (!finalUrl || finalUrl.hostname.toLowerCase() !== expectedHostname.toLowerCase()) {
    issues.push("browser did not remain on the exact Preview hostname");
  }
  if (snapshot.protectionInterstitial) issues.push("protection/interstitial document detected");
  if (snapshot.documentReadyState !== "complete") issues.push("document is not complete");
  if (!snapshot.nextBundleLoaded) issues.push("Next application bundle was not observed");
  if (successfulStatusCount(snapshot.sameOriginResourceStatusSummary?.js) === 0) {
    issues.push("no successful same-origin Next JavaScript response was observed");
  }
  if (!snapshot.domStable) issues.push("DOM did not reach a stable state");
  if ((snapshot.sameOriginResourceStatusSummary?.challenge302 ?? 0) > 0) {
    issues.push("same-origin JS/CSS/RSC request returned a 302 protection challenge");
  }
  return issues;
}

export function assertSessionReady(snapshot, expectedHostname) {
  const issues = sessionReadinessIssues(snapshot, expectedHostname);
  if (issues.length) throw new Error(`browser session is not ready: ${issues.join("; ")}`);
}

export async function installHostBoundPreviewBypass(context, { hostname, credential }) {
  if (!hostname || !credential) throw new Error("hostname and in-memory credential are required");
  const expected = hostname.toLowerCase();

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = urlFor(request.url());
    const method = request.method().toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      await route.abort("blockedbyclient");
      return;
    }
    if (!url || url.protocol !== "https:" || url.hostname.toLowerCase() !== expected) {
      await route.continue();
      return;
    }

    const headers = {
      ...request.headers(),
      "x-vercel-protection-bypass": credential,
    };
    if (request.resourceType() === "document") headers["x-vercel-set-bypass-cookie"] = "true";
    await route.continue({ headers });
  });
}

export function safeCookieMetadata(cookies, expectedHostname) {
  const expected = expectedHostname.toLowerCase();
  return cookies
    .filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, "").toLowerCase();
      return domain === expected;
    })
    .map(({ name, domain, secure }) => ({ name, domain, secure: Boolean(secure) }));
}

export async function captureBrowserDom(page, expectedHostname) {
  return page.evaluate(({ expectedHostname: expected, householdHeroPathname }) => {
    const toPathname = (value) => {
      try {
        return new URL(value, window.location.href).pathname;
      } catch {
        return "";
      }
    };
    const imageNodes = Array.from(document.querySelectorAll("img[src], img[srcset]"));
    const heroImages = imageNodes
      .map((image) => {
        const slide = image.closest("li[aria-roledescription]");
        const link = image.closest("a[href]");
        const slides = slide?.parentElement
          ? Array.from(slide.parentElement.querySelectorAll(":scope > li[aria-roledescription]"))
          : [];
        return {
          currentSrc: image.currentSrc,
          src: image.getAttribute("src") || image.src,
          baseUrl: window.location.href,
          linkHref: link?.getAttribute("href") || "",
          sizes: image.getAttribute("sizes") || "",
          loading: image.getAttribute("loading") || "",
          fetchPriority: image.getAttribute("fetchpriority") || image.fetchPriority || "",
          width: image.getAttribute("width") || "",
          height: image.getAttribute("height") || "",
          slideIndex: slide ? slides.indexOf(slide) : -1,
          slideAriaHidden: slide?.getAttribute("aria-hidden") || "",
          pathname: toPathname(image.currentSrc || image.getAttribute("src") || image.src),
        };
      })
      .filter((image) => /^\/homepage\/[a-z0-9-]+-category-hero\.webp$/.test(image.pathname));
    const categoryLinks = Array.from(document.querySelectorAll("a[href]"))
      .map((link) => toPathname(link.getAttribute("href") || ""))
      .filter((pathname) => /^\/shop\/[a-z0-9-]+$/.test(pathname));
    const bodyText = document.body?.innerText || "";
    const documentTitle = document.title || "";
    const protectionInterstitial = (
      /authentication required|log in to vercel|deployment protection/i.test(`${documentTitle}\n${bodyText}`)
      || Boolean(document.querySelector('[data-testid*="protection"], [class*="protection-interstitial"]'))
    );
    const nextBundleLoaded = Array.from(document.scripts).some((script) => {
      const url = new URL(script.src || "", window.location.href);
      return url.hostname === expected && url.pathname.startsWith("/_next/static/");
    });
    const nextErrorBoundary = Boolean(document.querySelector("nextjs-portal, [data-nextjs-error-boundary], #__next-error"));
    const imagePathnames = [...new Set(imageNodes
      .map((image) => toPathname(image.currentSrc || image.getAttribute("src") || image.src))
      .filter((pathname) => pathname.startsWith("/homepage/")))];
    const heroSelectorMatchCount = heroImages.filter((image) => (
      image.pathname === householdHeroPathname
      && toPathname(image.linkHref) === "/shop/household"
    )).length;
    const categorySlideCount = new Set(heroImages.map((image) => image.slideIndex).filter((index) => index >= 0)).size;
    const bodyLength = document.body?.innerHTML?.length ?? 0;

    return {
      finalUrl: window.location.href,
      documentTitle,
      documentReadyState: document.readyState,
      bodyLength,
      imagePathnames,
      heroSelectorMatchCount,
      categoryLinkCount: categoryLinks.length,
      categorySlideCount,
      protectionInterstitial,
      nextBundleLoaded,
      nextErrorBoundary,
      heroImages,
      domFingerprint: [bodyLength, imageNodes.length, categoryLinks.length, categorySlideCount].join(":"),
    };
  }, { expectedHostname, householdHeroPathname: HOUSEHOLD_HERO_PATHNAME });
}

export async function waitForStableBrowserDom(page, expectedHostname, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const intervalMs = options.intervalMs ?? 250;
  const requiredStableSamples = options.requiredStableSamples ?? 3;
  const startedAt = Date.now();
  let previousFingerprint = "";
  let stableSamples = 0;
  let latest;

  while (Date.now() - startedAt < timeoutMs) {
    latest = await captureBrowserDom(page, expectedHostname);
    if (latest.domFingerprint === previousFingerprint) stableSamples += 1;
    else stableSamples = 1;
    previousFingerprint = latest.domFingerprint;
    if (
      latest.documentReadyState === "complete"
      && latest.nextBundleLoaded
      && !latest.protectionInterstitial
      && stableSamples >= requiredStableSamples
    ) return { ...latest, domStable: true };
    await page.waitForTimeout(intervalMs);
  }

  return { ...latest, domStable: false };
}

export function safeFailureDiagnostics(snapshot) {
  return {
    finalUrl: snapshot.finalUrl || "",
    httpStatus: Number(snapshot.httpStatus || 0),
    documentTitle: snapshot.documentTitle || "",
    documentReadyState: snapshot.documentReadyState || "",
    bodyLength: Number(snapshot.bodyLength || 0),
    imagePathnames: [...new Set(snapshot.imagePathnames ?? [])],
    heroSelectorMatchCount: Number(snapshot.heroSelectorMatchCount || 0),
    sameOriginResourceStatusSummary: snapshot.sameOriginResourceStatusSummary ?? {},
    consoleErrorSummary: snapshot.consoleErrorSummary ?? { count: 0, messages: [] },
    nextErrorBoundary: Boolean(snapshot.nextErrorBoundary),
    categoryLinkCount: Number(snapshot.categoryLinkCount || 0),
    categorySlideCount: Number(snapshot.categorySlideCount || 0),
  };
}
