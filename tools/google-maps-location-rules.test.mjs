import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildGoogleMapsScriptUrl } from "../components/account/google-maps-loader.ts";

test("Google Maps loader preserves path-based website referrer restrictions", () => {
  const url = new URL(buildGoogleMapsScriptUrl("browser-key", "ka"));

  assert.equal(url.origin, "https://maps.googleapis.com");
  assert.equal(url.searchParams.get("key"), "browser-key");
  assert.equal(url.searchParams.get("language"), "ka");
  assert.equal(url.searchParams.get("region"), "GE");
  assert.equal(url.searchParams.has("auth_referrer_policy"), false);
});

test("Google Maps authentication and stalled loads have an explicit failure path", () => {
  const source = readFileSync(
    new URL("../components/account/google-maps-loader.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /gm_authFailure/);
  assert.match(source, /GOOGLE_MAPS_AUTH_FAILURE_EVENT/);
  assert.match(source, /Google Maps load timed out/);
});

test("location capture still works when the visual map is unavailable", () => {
  const source = readFileSync(
    new URL("../components/account/GoogleMapLocationPicker.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /disabled=\{locating\}/);
  assert.match(source, /name="latitude"/);
  assert.match(source, /name="longitude"/);
  assert.match(source, /mapUnavailable/);
  assert.match(source, /Google Maps-ზე გახსნა/);
});
