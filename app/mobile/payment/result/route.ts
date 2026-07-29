import { NextResponse } from "next/server";
import { uuidPattern } from "@/lib/mobile-api/http";

export function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const order = query.get("order") ?? "";
  const returned = query.get("return") === "fail" ? "fail" : "success";
  const fallback = new URL("/checkout/result", request.url);
  if (uuidPattern.test(order)) fallback.searchParams.set("order", order);
  fallback.searchParams.set("return", returned);
  return NextResponse.redirect(fallback, 307);
}
