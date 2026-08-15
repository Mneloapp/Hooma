import assert from "node:assert/strict";
import test from "node:test";

import { assertCanonical, canonical, canonicalUrls } from "../scripts/seo-regression.mjs";

const canonicalUrl = "https://hooma.ge/";

const validFixtures = [
  ["canonical is the first rel token", '<link rel="canonical alternate" href="https://hooma.ge">'],
  ["canonical is the last rel token", '<link rel="alternate canonical" href="https://hooma.ge/">'],
  ["rel precedes href", '<link rel="canonical" href="https://hooma.ge/">'],
  ["href precedes rel", '<link href="https://hooma.ge/" rel="canonical">'],
  ["single quotes", "<link rel='canonical' href='https://hooma.ge/'>"],
  ["double quotes", '<link rel="canonical" href="https://hooma.ge/">'],
  [
    "multiline self-closing tag",
    `<link
      href="https://hooma.ge/"
      rel="canonical"
    />`,
  ],
  [
    "additional attributes and whitespace around equals",
    '<link data-source="metadata" href = "https://hooma.ge/" rel = "canonical" media="all">',
  ],
  ["canonical in head", '<html><head><link rel="canonical" href="https://hooma.ge/"></head><body></body></html>'],
  [
    "canonical in body like streamed metadata",
    '<html><head></head><body><main>storefront</main><link href="https://hooma.ge/" rel="canonical"></body></html>',
  ],
];

for (const [name, html] of validFixtures) {
  test(name, () => {
    assert.equal(canonicalUrls(html).length, 1);
    assert.equal(canonical(html, name), canonicalUrl);
    assert.doesNotThrow(() => assertCanonical(html, "https://hooma.ge", name));
  });
}

test("canonical is absent", () => {
  assert.deepEqual(canonicalUrls("<html><head><title>Hooma</title></head></html>"), []);
  assert.throws(() => canonical("<html></html>", "missing fixture"), /exactly one canonical/);
});

test("canonical is empty", () => {
  const html = '<link rel="canonical" href="">';
  assert.deepEqual(canonicalUrls(html), [""]);
  assert.throws(() => canonical(html, "empty fixture"), /must not be empty/);
});

test("two canonical tags are rejected", () => {
  const html = [
    '<link rel="canonical" href="https://hooma.ge/">',
    '<link href="https://hooma.ge/" rel="canonical">',
  ].join("");
  assert.equal(canonicalUrls(html).length, 2);
  assert.throws(() => canonical(html, "duplicate fixture"), /exactly one canonical/);
});

test("Preview hostname canonical is rejected", () => {
  const html = '<link rel="canonical" href="https://hooma-nnggn0mg6-mnelo.vercel.app/">';
  assert.throws(() => assertCanonical(html, canonicalUrl, "Preview fixture"), /must use the apex host/);
});

test("canonical query is rejected", () => {
  const html = '<link rel="canonical" href="https://hooma.ge/?q=holder">';
  assert.throws(() => canonical(html, "query fixture"), /must not include a query/);
});

test("canonical hash is rejected", () => {
  const html = '<link rel="canonical" href="https://hooma.ge/#catalog">';
  assert.throws(() => canonical(html, "hash fixture"), /must not include a hash/);
});
