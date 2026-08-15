import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const [heroSource, nextConfig, homePageSource, homeClientSource] = await Promise.all([
  readFile(new URL("../components/home/HomeCategoryHero.tsx", import.meta.url), "utf8"),
  readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeStorefrontClient.tsx", import.meta.url), "utf8"),
]);

const heroImageMarkup = heroSource.match(/<img\b[\s\S]*?\/>/)?.[0] ?? "";

function renderActualHero() {
  const compiled = ts.transpileModule(heroSource, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "HomeCategoryHero.tsx",
  }).outputText;
  const testModule = { exports: {} };
  const Icon = (props) => React.createElement("svg", props);
  const Link = ({ href, children, ...props }) => React.createElement("a", { ...props, href }, children);
  const mockedRequire = (specifier) => {
    if (specifier === "react" || specifier === "react/jsx-runtime") return require(specifier);
    if (specifier === "next/link") return { __esModule: true, default: Link };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@/components/LanguageProvider") return { useLanguage: () => ({ language: "ka" }) };
    if (specifier === "@/lib/seo") return { categoryPath: (slug) => `/shop/${slug}` };
    throw new Error(`Unexpected fixture import: ${specifier}`);
  };
  new Function("require", "module", "exports", compiled)(mockedRequire, testModule, testModule.exports);
  return renderToStaticMarkup(React.createElement(testModule.exports.HomeCategoryHero));
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? ""]),
  );
}

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

test("actual HomeCategoryHero server render contains the active household slide before hydration", () => {
  const markup = renderActualHero();
  const imageTags = [...markup.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const images = imageTags.map(attributes);
  assert.equal(images.length, 11);

  const initial = images.find((image) => image.src === "/homepage/household-category-hero.webp");
  assert.ok(initial, "household hero must render on the server");
  assert.equal(initial.sizes, "100vw");
  assert.equal(initial.loading, "eager");
  assert.equal(initial.fetchpriority, "high");
  assert.equal(initial.width, "1774");
  assert.equal(initial.height, "887");

  const deferred = images.filter((image) => image !== initial);
  assert.ok(deferred.length > 0);
  assert.ok(deferred.every((image) => image.loading === "lazy" && image.fetchpriority === "auto"));

  const slides = [...markup.matchAll(/<li\b[^>]*aria-roledescription="[^"]+"[^>]*>/g)]
    .map((match) => attributes(match[0]));
  assert.equal(slides.length, 11);
  assert.equal(slides[0]["aria-hidden"], "false", "initial activeIndex must be 0");
  assert.ok(slides.slice(1).every((slide) => slide["aria-hidden"] === "true"));
  assert.equal(markup.match(/<link\b[^>]*rel="preload"[^>]*href="\/homepage\/household-category-hero\.webp"[^>]*>/g)?.length, 1);
});

test("homepage data mapping cannot filter the static category-hero slides", () => {
  assert.match(homePageSource, /<HomeStorefrontClient[\s\S]*categoryProducts=\{categoryProducts\}/);
  assert.match(homeClientSource, /<HomeCategoryHero \/>/);
  assert.ok(homeClientSource.indexOf("<HomeCategoryHero />") < homeClientSource.indexOf("homepageCategories.map"));
  assert.match(heroSource, /const categoryPosters: CategoryPoster\[\] = \[/);
  assert.match(heroSource, /categoryPosters\.map\(\(poster, index\)/);
  assert.doesNotMatch(heroSource, /categoryPosters\.filter|categoryProducts/);
});
