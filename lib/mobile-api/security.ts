export function readBearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(value);
  const token = match?.[1] ?? "";
  return token.length <= 8192 ? token : "";
}

export function isOwnedUploadPath(userId: string, requestId: string, path: string) {
  if (!userId || !requestId || !path) return false;
  const prefix = `${userId}/${requestId}/`;
  return path.startsWith(prefix)
    && path.split("/").length === 3
    && !path.includes("..")
    && !path.includes("\\");
}
