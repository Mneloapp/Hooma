import "server-only";

import { timingSafeEqual } from "node:crypto";

export function authenticateSocialCronRequest(request: Request) {
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(supplied, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
