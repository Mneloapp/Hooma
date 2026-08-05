function normalizePathname(pathname: string | null | undefined) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.replace(/\/+$/, "");
  return pathname;
}

export function isAccountLinkActive(pathname: string | null | undefined, href: string) {
  const currentPath = normalizePathname(pathname);
  const linkPath = normalizePathname(href);

  if (linkPath === "/account") return currentPath === linkPath;
  return currentPath === linkPath || currentPath.startsWith(`${linkPath}/`);
}
