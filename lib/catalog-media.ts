const MAKERWORLD_MEDIA_HOST = "makerworld.bblmw.com";

/**
 * Uses MakerWorld's existing public image transformation parameters to avoid
 * downloading multi-megapixel originals into small storefront cards. Hooma's
 * Supabase media and local assets are intentionally left untouched.
 */
export function catalogImageUrl(source: string, requestedWidth: number) {
  if (!source.startsWith("https://")) return source;
  try {
    const url = new URL(source);
    if (url.hostname.toLowerCase() !== MAKERWORLD_MEDIA_HOST) return source;
    const width = Math.min(1600, Math.max(240, Math.round(requestedWidth)));
    url.search = "";
    url.searchParams.set("x-oss-process", `image/resize,w_${width}/format,webp`);
    return url.toString();
  } catch {
    return source;
  }
}
