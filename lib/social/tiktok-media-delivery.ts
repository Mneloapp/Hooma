import "server-only";

import { socialMediaBaseUrl } from "./config";

export const TIKTOK_MEDIA_PROXY_PREFIX =
  "https://hooma.ge/api/social/tiktok/media/" as const;

const SHA256 = /^[a-f0-9]{64}$/;
const SIGNED_OBJECT_PREFIX = "/storage/v1/object/sign/social-publishing-staging/";

function sourceUrl(value: string) {
  const source = new URL(value);
  const expectedOrigin = new URL(socialMediaBaseUrl()).origin;
  if (
    source.protocol !== "https:"
    || source.username
    || source.password
    || source.hash
    || source.origin !== expectedOrigin
    || !source.pathname.startsWith(SIGNED_OBJECT_PREFIX)
    || !source.searchParams.get("token")
  ) throw new Error("TIKTOK_MEDIA_SOURCE_INVALID");
  return source;
}

export function tiktokMediaDeliveryUrl(
  signedSourceUrl: string,
  expectedVideoSha256: string,
) {
  if (!SHA256.test(expectedVideoSha256)) throw new Error("TIKTOK_MEDIA_SHA_INVALID");
  const source = sourceUrl(signedSourceUrl);
  if (!decodeURIComponent(source.pathname).endsWith(`/${expectedVideoSha256}.mp4`)) {
    throw new Error("TIKTOK_MEDIA_SOURCE_BINDING_MISMATCH");
  }
  const delivery = new URL(`${expectedVideoSha256}.mp4`, TIKTOK_MEDIA_PROXY_PREFIX);
  delivery.searchParams.set("source", Buffer.from(source.toString(), "utf8").toString("base64url"));
  return delivery.toString();
}

export function decodeTikTokMediaSource(
  encodedSource: string,
  assetName: string,
) {
  const match = /^([a-f0-9]{64})\.mp4$/.exec(assetName);
  if (!match || encodedSource.length < 32 || encodedSource.length > 16_384) {
    throw new Error("TIKTOK_MEDIA_DELIVERY_REQUEST_INVALID");
  }
  let decoded: string;
  try {
    decoded = Buffer.from(encodedSource, "base64url").toString("utf8");
  } catch {
    throw new Error("TIKTOK_MEDIA_DELIVERY_REQUEST_INVALID");
  }
  const source = sourceUrl(decoded);
  if (!decodeURIComponent(source.pathname).endsWith(`/${match[1]}.mp4`)) {
    throw new Error("TIKTOK_MEDIA_SOURCE_BINDING_MISMATCH");
  }
  return source;
}
