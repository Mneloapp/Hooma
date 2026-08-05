"use client";

import {
  Crosshair,
  ExternalLink,
  LocateFixed,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GOOGLE_MAPS_AUTH_FAILURE_EVENT,
  loadGoogleMaps,
} from "@/components/account/google-maps-loader";

type Coordinates = { latitude: number; longitude: number };

type GoogleMapLocationPickerProps = {
  apiKey: string;
  language: "ka" | "en";
  initialLatitude: number | null;
  initialLongitude: number | null;
  onLocationChange: () => void;
};

function mapsUrl(coordinates: Coordinates | null) {
  return coordinates
    ? `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude.toFixed(6)}%2C${coordinates.longitude.toFixed(6)}`
    : "";
}

export function GoogleMapLocationPicker({
  apiKey,
  language,
  initialLatitude,
  initialLongitude,
  onLocationChange,
}: GoogleMapLocationPickerProps) {
  const georgian = language === "ka";
  const initialCoordinates =
    initialLatitude !== null && initialLongitude !== null
      ? { latitude: initialLatitude, longitude: initialLongitude }
      : null;
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const interactedRef = useRef(Boolean(initialCoordinates));
  const coordinatesRef = useRef<Coordinates | null>(initialCoordinates);
  const [coordinates, setCoordinates] =
    useState<Coordinates | null>(initialCoordinates);
  const [loading, setLoading] = useState(Boolean(apiKey));
  const [mapUnavailable, setMapUnavailable] = useState(!apiKey);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const shareUrl = useMemo(() => mapsUrl(coordinates), [coordinates]);

  useEffect(() => {
    if (!apiKey || !mapElementRef.current) {
      setLoading(false);
      setMapUnavailable(true);
      return;
    }

    let active = true;
    let listeners: any[] = [];
    const showMapFailure = () => {
      if (!active) return;
      setLoading(false);
      setMapUnavailable(true);
      setError(
        georgian
          ? "რუკა დროებით ვერ ჩაიტვირთა. მიმდინარე მდებარეობის მონიშვნა და მისამართის შენახვა მაინც შეგიძლია."
          : "The map could not load. You can still use your current location and save the address.",
      );
    };

    window.addEventListener(
      GOOGLE_MAPS_AUTH_FAILURE_EVENT,
      showMapFailure,
    );
    setLoading(true);
    setMapUnavailable(false);

    loadGoogleMaps(apiKey, language)
      .then(async (maps) => {
        if (!active || !mapElementRef.current) return;
        const { Map } = await maps.importLibrary("maps");
        if (!active || !mapElementRef.current) return;

        const selectedCoordinates = coordinatesRef.current;
        const center = selectedCoordinates
          ? {
              lat: selectedCoordinates.latitude,
              lng: selectedCoordinates.longitude,
            }
          : { lat: 41.7151, lng: 44.8271 };
        const map = new Map(mapElementRef.current, {
          center,
          zoom: selectedCoordinates ? 17 : 12,
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
        mapRef.current = map;

        const storeCenter = () => {
          if (!interactedRef.current) return;
          const selected = map.getCenter();
          if (!selected) return;
          const nextCoordinates = {
            latitude: Number(selected.lat().toFixed(7)),
            longitude: Number(selected.lng().toFixed(7)),
          };
          coordinatesRef.current = nextCoordinates;
          setCoordinates(nextCoordinates);
        };

        listeners = [
          map.addListener("dragstart", () => {
            interactedRef.current = true;
            onLocationChange();
          }),
          map.addListener("idle", storeCenter),
          map.addListener("click", (event: any) => {
            if (!event.latLng) return;
            interactedRef.current = true;
            onLocationChange();
            map.panTo(event.latLng);
          }),
        ];
        setError("");
        setLoading(false);
      })
      .catch(showMapFailure);

    return () => {
      active = false;
      window.removeEventListener(
        GOOGLE_MAPS_AUTH_FAILURE_EVENT,
        showMapFailure,
      );
      listeners.forEach((listener) => listener?.remove?.());
      mapRef.current = null;
    };
  }, [apiKey, language]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError(
        georgian
          ? "ამ ბრაუზერს მიმდინარე მდებარეობის მიღება არ შეუძლია."
          : "This browser cannot access your current location.",
      );
      return;
    }

    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const selected = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        interactedRef.current = true;
        coordinatesRef.current = selected;
        setCoordinates(selected);
        onLocationChange();
        mapRef.current?.setZoom(18);
        mapRef.current?.panTo({
          lat: selected.latitude,
          lng: selected.longitude,
        });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError(
          georgian
            ? "ლოკაციის მიღება ვერ მოხერხდა. ბრაუზერში Location წვდომა ჩართე ან რუკა ხელით გადაადგილე."
            : "Could not get your location. Allow browser location access or move the map manually.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  return (
    <section className="md:col-span-2">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold">
            {georgian
              ? "ზუსტი ლოკაცია Google Maps-ზე"
              : "Exact Google Maps location"}
          </p>
          <p
            id="delivery-map-instructions"
            className="mt-1 text-xs leading-5 text-hooma-muted"
          >
            {georgian
              ? "გადაადგილე რუკა ისე, რომ პინი ზუსტად შესასვლელზე იდგეს, ან გამოიყენე მიმდინარე მდებარეობა."
              : "Move the map until the pin is exactly at the entrance, or use your current location."}
          </p>
        </div>
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-hooma-text/10 bg-white px-4 text-xs font-semibold transition hover:border-hooma-accent disabled:opacity-50"
        >
          <LocateFixed size={16} />
          {locating
            ? georgian
              ? "იძებნება..."
              : "Locating..."
            : georgian
              ? "ჩემი მიმდინარე მდებარეობა"
              : "Use current location"}
        </button>
      </div>

      <input
        type="hidden"
        name="latitude"
        value={coordinates?.latitude ?? ""}
      />
      <input
        type="hidden"
        name="longitude"
        value={coordinates?.longitude ?? ""}
      />

      {!mapUnavailable ? (
        <div className="relative mt-3 h-[360px] overflow-hidden rounded-[1.5rem] border border-hooma-text/10 bg-hooma-panel">
          <div
            ref={mapElementRef}
            className="h-full w-full"
            aria-label={
              georgian
                ? "მიწოდების ზუსტი ლოკაციის ასარჩევი რუკა"
                : "Map for selecting the exact delivery location"
            }
            aria-describedby="delivery-map-instructions"
          />
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow-lg">
            <MapPin
              size={42}
              className={
                coordinates
                  ? "fill-hooma-accent text-white"
                  : "fill-hooma-muted text-white"
              }
              strokeWidth={1.8}
            />
          </div>
          {loading ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 grid place-items-center bg-hooma-panel/90 text-sm font-semibold"
            >
              <span className="inline-flex items-center gap-2">
                <Crosshair size={18} />
                {georgian ? "რუკა იტვირთება..." : "Loading map..."}
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex min-h-44 flex-col items-center justify-center rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-6 text-center text-amber-950">
          <MapPin size={28} />
          <p className="mt-3 text-sm font-semibold">
            {georgian ? "რუკა დროებით მიუწვდომელია" : "Map temporarily unavailable"}
          </p>
          <p className="mt-1 max-w-lg text-xs leading-5">
            {georgian
              ? "შეგიძლია გამოიყენო მიმდინარე მდებარეობა და შემდეგ შეინახო მისამართი."
              : "You can use your current location and then save the address."}
          </p>
          {apiKey ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-900/15 bg-white px-4 py-2 text-xs font-semibold"
            >
              <RefreshCw size={14} />
              {georgian ? "ხელახლა ცდა" : "Try again"}
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      {coordinates ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="inline-flex items-center gap-2 font-semibold">
            <MapPin size={16} />
            {georgian ? "ლოკაცია მონიშნულია" : "Location selected"} ·{" "}
            {coordinates.latitude.toFixed(6)}, {coordinates.longitude.toFixed(6)}
          </span>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2"
          >
            {georgian ? "Google Maps-ზე გახსნა" : "Open in Google Maps"}
            <ExternalLink size={13} />
          </a>
        </div>
      ) : (
        <p className="mt-3 text-xs text-hooma-muted">
          {georgian
            ? "ზუსტი ლოკაცია ჯერ არ არის მონიშნული."
            : "An exact location has not been selected yet."}
        </p>
      )}
    </section>
  );
}
