import { NextResponse } from "next/server";
import { uuidPattern } from "@/lib/mobile-api/http";

export function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const purchase = query.get("purchase") ?? "";
  const returned = query.get("return") === "fail" ? "fail" : "success";
  const fallback = new URL("/account/hooma-plus/result", request.url);
  if (uuidPattern.test(purchase)) fallback.searchParams.set("purchase", purchase);
  fallback.searchParams.set("return", returned);
  return NextResponse.redirect(fallback, 307);
}
