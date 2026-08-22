import type { BeforeSendEvent } from "@vercel/analytics/next";

const PUBLIC_HOSTNAMES = new Set(["hooma.ge", "www.hooma.ge"]);

const PRIVATE_ROUTE_PREFIXES = [
  "/account",
  "/admin",
  "/api",
  "/auth",
  "/cart",
  "/checkout",
  "/login",
  "/logout",
  "/notifications",
  "/signup",
];

function isPrivateRoute(pathname: string) {
  return PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function filterPublicAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url, "https://hooma.ge");
    if (
      url.protocol !== "https:" ||
      !PUBLIC_HOSTNAMES.has(url.hostname) ||
      isPrivateRoute(url.pathname) ||
      url.searchParams.has("preview")
    ) {
      return null;
    }

    url.search = "";
    url.hash = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
