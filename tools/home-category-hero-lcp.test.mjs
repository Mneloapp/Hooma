import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const [heroSource, nextConfig] = await Promise.all([
  readFile(new URL("../components/home/HomeCategoryHero.tsx", import.meta.url), "utf8"),
  readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
]);

const heroImageMarkup = heroSource.match(/<img\b[\s\S]*?\/>/)?.[0] ?? "";

test("initial category hero keeps a full-width eager high-priority image contract", () => {
  assert.ok(heroImageMarkup, "hero image markup must exist");
  assert.match(heroImageMarkup, /sizes="100vw"/);
  assert.doesNotMatch(heroImageMarkup, /sizes=\{[^}]*\|\|\s*""/);
  assert.match(heroImageMarkup, /loading=\{isInitialPoster \? "eager" : "lazy"\}/);
  assert.match(heroImageMarkup, /fetchPriority=\{isInitialPoster \? "high" : "auto"\}/);
  assert.match(heroImageMarkup, /width=\{HERO_IMAGE_WIDTH\}/);
  assert.match(heroImageMarkup, /height=\{HERO_IMAGE_HEIGHT\}/);
  assert.match(heroImageMarkup, /absolute inset-0 h-full w-full/);
  assert.doesNotMatch(heroImageMarkup, /loading="lazy"/);
});

test("only the initial category hero receives preload priority", () => {
  assert.equal(heroSource.match(/const isInitialPoster = index === 0/g)?.length, 1);
  assert.equal(heroSource.match(/fetchPriority=\{isInitialPoster \? "high" : "auto"\}/g)?.length, 1);
  assert.equal(heroSource.match(/loading=\{isInitialPoster \? "eager" : "lazy"\}/g)?.length, 1);

  const initialMarkup = renderToStaticMarkup(React.createElement("img", {
    src: "/homepage/household-category-hero.webp",
    alt: "",
    width: 1774,
    height: 887,
    sizes: "100vw",
    loading: "eager",
    fetchPriority: "high",
  }));
  const deferredMarkup = renderToStaticMarkup(React.createElement("img", {
    src: "/homepage/art-category-hero.webp",
    alt: "",
    width: 1774,
    height: 887,
    sizes: "100vw",
    loading: "lazy",
    fetchPriority: "auto",
  }));

  assert.equal(initialMarkup.match(/rel="preload"/g)?.length, 1);
  assert.match(initialMarkup, /imageSizes="100vw"/);
  assert.match(initialMarkup, /fetchPriority="high"/);
  assert.doesNotMatch(initialMarkup, /loading="lazy"/);
  assert.doesNotMatch(deferredMarkup, /rel="preload"/);
  assert.match(deferredMarkup, /loading="lazy"/);
});

test("hero documents the current unoptimized pipeline without inventing srcset variants", () => {
  assert.match(nextConfig, /images:\s*\{[\s\S]*?unoptimized:\s*true/);
  assert.doesNotMatch(heroImageMarkup, /srcSet=/);
  assert.match(heroImageMarkup, /alt=""/);
  assert.match(heroSource, /aria-label=\{title\}/);
});
