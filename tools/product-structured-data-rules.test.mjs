import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildProductReviewStructuredData,
  buildStructuredProductCategory,
} from "../lib/product-structured-data.ts";

const productPage = await readFile(new URL("../app/product/[slug]/page.tsx", import.meta.url), "utf8");

test("merchant category uses the existing English catalog hierarchy", () => {
  assert.equal(buildStructuredProductCategory("Art", "Sculptures"), "Art > Sculptures");
  assert.equal(buildStructuredProductCategory("  Household  ", "Household"), "Household");
  assert.equal(buildStructuredProductCategory(undefined, undefined), undefined);
  assert.match(productPage, /buildStructuredProductCategory\(localizedCategory\?\.name, localizedSubcategory\?\.name\)/);
  assert.doesNotMatch(productPage, /category: localizedCategory\?\.nameKa/);
  assert.doesNotMatch(productPage, /shippingDetails|hasMerchantReturnPolicy/);
});

test("review markup is emitted only from real, valid published review data", () => {
  const markup = buildProductReviewStructuredData({
    ratingAverage: 4.5,
    ratingCount: 2,
    reviews: [{
      id: "review-1",
      rating: 5,
      comment: "  ძალიან კარგი ნივთია.  ",
      reviewerName: "  ნინო  ",
      createdAt: "2026-08-20T10:00:00.000Z",
    }],
  });

  assert.deepEqual(markup.aggregateRating, {
    "@type": "AggregateRating",
    ratingValue: 4.5,
    reviewCount: 2,
    bestRating: 5,
    worstRating: 1,
  });
  assert.equal(markup.review?.length, 1);
  assert.equal(markup.review?.[0].author.name, "ნინო");
  assert.equal(markup.review?.[0].reviewBody, "ძალიან კარგი ნივთია.");
  assert.equal(markup.review?.[0].reviewRating.ratingValue, 5);
});

test("ratings and reviews are never invented for products without valid reviews", () => {
  assert.deepEqual(buildProductReviewStructuredData({ ratingAverage: 5, ratingCount: 1, reviews: [] }), {});
  assert.deepEqual(buildProductReviewStructuredData({
    ratingAverage: 5,
    ratingCount: 1,
    reviews: [{ id: "bad", rating: 7, comment: "Test", reviewerName: "Test", createdAt: "not-a-date" }],
  }), {});
  assert.deepEqual(buildProductReviewStructuredData({
    ratingAverage: 5,
    ratingCount: 1,
    reviews: [{ id: "generic", rating: 5, comment: "Test", reviewerName: "Hooma მომხმარებელი", createdAt: "2026-08-20T10:00:00.000Z" }],
  }), {});
});

test("structured review payload is bounded without changing the visible review list", () => {
  const reviews = Array.from({ length: 12 }, (_, index) => ({
    id: String(index),
    rating: 5,
    comment: `Review ${index}`,
    reviewerName: `Reviewer ${index}`,
    createdAt: "2026-08-20T10:00:00.000Z",
  }));
  const markup = buildProductReviewStructuredData({ ratingAverage: 5, ratingCount: 12, reviews });
  assert.equal(markup.review?.length, 10);
});
