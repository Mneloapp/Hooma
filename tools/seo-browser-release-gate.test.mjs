import assert from "node:assert/strict";
import test from "node:test";
import {
  HERO_BROWSER_CONTRACT,
  assertHeroContract,
  assertSessionReady,
  createSameOriginResponseRecorder,
  installHostBoundPreviewBypass,
  safeCookieMetadata,
  safeFailureDiagnostics,
  selectHouseholdHero,
  sessionReadinessIssues,
  waitForStableBrowserDom,
} from "./seo-browser-release-gate.mjs";

const previewHostname = "hooma-fixture-mnelo.vercel.app";
const previewUrl = `https://${previewHostname}/`;

function heroFixture(overrides = {}) {
  return {
    currentSrc: `${previewUrl.slice(0, -1)}/homepage/household-category-hero.webp`,
    src: "/homepage/household-category-hero.webp",
    baseUrl: previewUrl,
    linkHref: "/shop/household",
    sizes: "100vw",
    loading: "eager",
    fetchPriority: "high",
    width: "1774",
    height: "887",
    slideIndex: 0,
    slideAriaHidden: "false",
    ...overrides,
  };
}

function readySnapshot(overrides = {}) {
  return {
    finalUrl: previewUrl,
    httpStatus: 200,
    documentTitle: "Hooma",
    documentReadyState: "complete",
    bodyLength: 12_000,
    imagePathnames: ["/homepage/household-category-hero.webp"],
    heroSelectorMatchCount: 1,
    categoryLinkCount: 11,
    categorySlideCount: 11,
    protectionInterstitial: false,
    nextBundleLoaded: true,
    nextErrorBoundary: false,
    domStable: true,
    sameOriginResourceStatusSummary: { document: { 200: 1 }, js: { 200: 4 }, css: { 200: 1 }, rsc: { 200: 1 }, challenge302: 0 },
    consoleErrorSummary: { count: 0, messages: [] },
    heroImages: [
      heroFixture(),
      heroFixture({
        currentSrc: "",
        src: "/homepage/art-category-hero.webp",
        linkHref: "/shop/art",
        loading: "lazy",
        fetchPriority: "auto",
        slideIndex: 1,
        slideAriaHidden: "true",
      }),
    ],
    ...overrides,
  };
}

test("semantic hero selector supports native img currentSrc/src without a Next Image wrapper", () => {
  const matches = selectHouseholdHero([
    heroFixture({ currentSrc: "", src: "/homepage/household-category-hero.webp" }),
    heroFixture({
      currentSrc: "https://cdn.invalid/not-the-household-hero.webp",
      src: "/homepage/art-category-hero.webp",
      linkHref: "/shop/art",
    }),
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].src, HERO_BROWSER_CONTRACT.householdImagePathname);
  assert.equal(matches[0].linkHref, HERO_BROWSER_CONTRACT.householdCategoryPathname);
});

test("hero contract accepts one active household slide and lazy deferred slides", () => {
  const initial = assertHeroContract(readySnapshot());
  assert.equal(initial.slideIndex, 0);
  assert.equal(initial.sizes, "100vw");
  assert.equal(initial.loading, "eager");
  assert.equal(initial.fetchPriority, "high");
  assert.equal(initial.width, "1774");
  assert.equal(initial.height, "887");
});

test("session readiness passes only after document, exact host, Next bundle, resources, and DOM are ready", () => {
  assert.deepEqual(sessionReadinessIssues(readySnapshot(), previewHostname), []);
  assert.doesNotThrow(() => assertSessionReady(readySnapshot(), previewHostname));

  const issues = sessionReadinessIssues(readySnapshot({
    finalUrl: "https://vercel.com/login",
    documentReadyState: "interactive",
    protectionInterstitial: true,
    nextBundleLoaded: false,
    domStable: false,
    sameOriginResourceStatusSummary: { challenge302: 2 },
  }), previewHostname);
  assert.equal(issues.length, 7);

  const missingBundleResponse = sessionReadinessIssues(readySnapshot({
    sameOriginResourceStatusSummary: { document: { 200: 1 }, js: {}, css: {}, rsc: {}, challenge302: 0 },
  }), previewHostname);
  assert.deepEqual(missingBundleResponse, ["no successful same-origin Next JavaScript response was observed"]);
});

test("same-origin recorder exposes JS/CSS/RSC 302 protection propagation without external noise", () => {
  const recorder = createSameOriginResponseRecorder(previewHostname);
  recorder.record({ url: `${previewUrl}_next/static/app.js`, status: 302, resourceType: "script" });
  recorder.record({ url: `${previewUrl}_next/static/app.css`, status: 200, resourceType: "stylesheet" });
  recorder.record({ url: `${previewUrl}?_rsc=fixture`, status: 302, resourceType: "fetch" });
  recorder.record({ url: "https://example.com/third-party.js", status: 302, resourceType: "script" });
  assert.deepEqual(recorder.summary(), {
    document: {},
    js: { 302: 1 },
    css: { 200: 1 },
    rsc: { 302: 1 },
    challenge302: 2,
  });
});

test("host-bound bypass headers never propagate to another origin and mutations are blocked", async () => {
  let handler;
  const context = {
    async route(pattern, callback) {
      assert.equal(pattern, "**/*");
      handler = callback;
    },
  };
  await installHostBoundPreviewBypass(context, { hostname: previewHostname, credential: "test-only-in-memory-value" });

  function routeFixture(url, { method = "GET", resourceType = "script" } = {}) {
    const calls = [];
    return {
      calls,
      request() {
        return {
          url: () => url,
          method: () => method,
          resourceType: () => resourceType,
          headers: () => ({ accept: "text/html" }),
        };
      },
      async continue(options) { calls.push({ action: "continue", options }); },
      async abort(reason) { calls.push({ action: "abort", reason }); },
    };
  }

  const exactDocument = routeFixture(previewUrl, { resourceType: "document" });
  await handler(exactDocument);
  assert.equal(exactDocument.calls[0].options.headers["x-vercel-protection-bypass"], "test-only-in-memory-value");
  assert.equal(exactDocument.calls[0].options.headers["x-vercel-set-bypass-cookie"], "true");

  const exactChunk = routeFixture(`${previewUrl}_next/static/app.js`);
  await handler(exactChunk);
  assert.equal(exactChunk.calls[0].options.headers["x-vercel-protection-bypass"], "test-only-in-memory-value");
  assert.equal(exactChunk.calls[0].options.headers["x-vercel-set-bypass-cookie"], undefined);

  const external = routeFixture("https://example.com/script.js");
  await handler(external);
  assert.deepEqual(external.calls, [{ action: "continue", options: undefined }]);

  const mutation = routeFixture(`${previewUrl}api/write`, { method: "POST", resourceType: "fetch" });
  await handler(mutation);
  assert.deepEqual(mutation.calls, [{ action: "abort", reason: "blockedbyclient" }]);

  const unexpectedMethod = routeFixture(previewUrl, { method: "PROPFIND", resourceType: "document" });
  await handler(unexpectedMethod);
  assert.deepEqual(unexpectedMethod.calls, [{ action: "abort", reason: "blockedbyclient" }]);
});

test("browser DOM waits for repeated stable complete snapshots instead of selecting immediately", async () => {
  const snapshots = [
    { ...readySnapshot(), documentReadyState: "interactive", nextBundleLoaded: false, domFingerprint: "1" },
    { ...readySnapshot(), domFingerprint: "2" },
    { ...readySnapshot(), domFingerprint: "2" },
    { ...readySnapshot(), domFingerprint: "2" },
  ];
  const page = {
    async evaluate() { return snapshots.shift() ?? readySnapshot({ domFingerprint: "2" }); },
    async waitForTimeout() {},
  };
  const result = await waitForStableBrowserDom(page, previewHostname, {
    timeoutMs: 1_000,
    intervalMs: 0,
    requiredStableSamples: 3,
  });
  assert.equal(result.domStable, true);
  assert.equal(result.domFingerprint, "2");
});

test("cookie and failure diagnostics retain only the approved non-secret fields", () => {
  assert.deepEqual(safeCookieMetadata([
    { name: "_vercel_bypass", value: "must-not-escape", domain: previewHostname, secure: true, httpOnly: true },
    { name: "external", value: "must-not-escape", domain: "example.com", secure: false },
  ], previewHostname), [
    { name: "_vercel_bypass", domain: previewHostname, secure: true },
  ]);

  const diagnostic = safeFailureDiagnostics({
    ...readySnapshot(),
    fullHtml: "must-not-escape",
    headers: { authorization: "must-not-escape" },
    cookies: [{ value: "must-not-escape" }],
    credential: "must-not-escape",
  });
  assert.deepEqual(Object.keys(diagnostic), [
    "finalUrl",
    "httpStatus",
    "documentTitle",
    "documentReadyState",
    "bodyLength",
    "imagePathnames",
    "heroSelectorMatchCount",
    "sameOriginResourceStatusSummary",
    "consoleErrorSummary",
    "nextErrorBoundary",
    "categoryLinkCount",
    "categorySlideCount",
  ]);
  assert.doesNotMatch(JSON.stringify(diagnostic), /must-not-escape|authorization|cookie|credential|html/i);
});
