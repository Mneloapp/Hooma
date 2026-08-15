const CANONICAL_SITE_ORIGIN = "https://hooma.ge";

function configuredOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function vercelPreviewOrigin() {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const deploymentHost = process.env.VERCEL_URL?.trim().toLowerCase();
  if (!deploymentHost) return null;
  try {
    const url = new URL(`https://${deploymentHost}`);
    if (url.host !== deploymentHost || !url.hostname.endsWith(".vercel.app")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves redirect origins only from deployment or trusted configuration.
 * Request Host headers are intentionally excluded to prevent host injection.
 */
export function trustedSiteOrigin() {
  return vercelPreviewOrigin()
    ?? configuredOrigin(process.env.NEXT_PUBLIC_SITE_URL)
    ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : CANONICAL_SITE_ORIGIN);
}
