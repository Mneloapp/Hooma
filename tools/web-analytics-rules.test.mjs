import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterPublicAnalyticsEvent } from "../lib/web-analytics.ts";

const [layout, component, packageJson] = await Promise.all([
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/WebAnalytics.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("root layout injects Vercel Web Analytics exactly once", () => {
  assert.equal(layout.match(/<WebAnalytics \/>/g)?.length, 1);
  assert.match(layout, /import \{ WebAnalytics \} from "@\/components\/WebAnalytics"/);
  assert.equal(packageJson.dependencies["@vercel/analytics"], "^2.0.1");
  assert.match(component, /^"use client";/);
  assert.match(component, /<Analytics beforeSend=\{filterPublicAnalyticsEvent\} \/>/);
  assert.doesNotMatch(component, /\btrack\s*\(/);
});

test("public page views retain only the origin and pathname", () => {
  assert.deepEqual(
    filterPublicAnalyticsEvent({ type: "pageview", url: "https://hooma.ge/shop/household?q=lamp&utm_source=test#products" }),
    { type: "pageview", url: "https://hooma.ge/shop/household" },
  );
  assert.deepEqual(
    filterPublicAnalyticsEvent({ type: "pageview", url: "/product/true-spring-3037752?color=red" }),
    { type: "pageview", url: "https://hooma.ge/product/true-spring-3037752" },
  );
});

test("private, authentication, checkout, and admin routes are never measured", () => {
  for (const pathname of [
    "/account",
    "/account/orders",
    "/admin",
    "/admin/products",
    "/api/contact",
    "/auth/callback",
    "/cart",
    "/checkout/result",
    "/login",
    "/logout",
    "/notifications",
    "/signup",
  ]) {
    assert.equal(filterPublicAnalyticsEvent({ type: "pageview", url: `https://hooma.ge${pathname}` }), null, pathname);
  }
});

test("admin product previews and malformed event URLs fail closed", () => {
  assert.equal(
    filterPublicAnalyticsEvent({ type: "pageview", url: "https://hooma.ge/product/example?preview=private-id" }),
    null,
  );
  assert.equal(filterPublicAnalyticsEvent({ type: "pageview", url: "http://[invalid" }), null);
});

test("Preview, system-alias, and insecure traffic cannot contaminate Production analytics", () => {
  for (const url of [
    "https://hooma-git-main-mnelo.vercel.app/",
    "https://hooma-mnelo.vercel.app/shop",
    "http://hooma.ge/",
  ]) {
    assert.equal(filterPublicAnalyticsEvent({ type: "pageview", url }), null, url);
  }

  assert.deepEqual(filterPublicAnalyticsEvent({ type: "pageview", url: "https://www.hooma.ge/about?from=footer" }), {
    type: "pageview",
    url: "https://www.hooma.ge/about",
  });
});
