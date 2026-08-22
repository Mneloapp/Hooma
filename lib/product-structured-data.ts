export type StructuredProductReviewInput = {
  id: string;
  rating: number;
  comment: string;
  reviewerName: string;
  createdAt: string;
};

const MAX_STRUCTURED_REVIEWS = 10;
const GENERIC_REVIEWER_NAMES = new Set(["hooma მომხმარებელი", "hooma user"]);

export function buildStructuredProductCategory(categoryName?: string, subcategoryName?: string) {
  const segments = [categoryName, subcategoryName]
    .map((segment) => segment?.trim())
    .filter((segment): segment is string => Boolean(segment));

  return segments.length ? [...new Set(segments)].join(" > ") : undefined;
}

export function buildProductReviewStructuredData({
  ratingAverage,
  ratingCount,
  reviews,
}: {
  ratingAverage: number;
  ratingCount: number;
  reviews: StructuredProductReviewInput[];
}) {
  const validReviews = reviews
    .filter((review) => (
      Number.isFinite(review.rating)
      && review.rating >= 1
      && review.rating <= 5
      && Boolean(review.reviewerName.trim())
      && !GENERIC_REVIEWER_NAMES.has(review.reviewerName.trim().toLocaleLowerCase())
      && Boolean(review.comment.trim())
      && Number.isFinite(Date.parse(review.createdAt))
    ))
    .slice(0, MAX_STRUCTURED_REVIEWS)
    .map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.reviewerName.trim() },
      datePublished: review.createdAt,
      reviewBody: review.comment.trim(),
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
    }));

  if (!validReviews.length) return {};

  const aggregateRating = Number.isFinite(ratingAverage)
    && ratingAverage >= 1
    && ratingAverage <= 5
    && Number.isInteger(ratingCount)
    && ratingCount > 0
    ? {
      "@type": "AggregateRating",
      ratingValue: ratingAverage,
      reviewCount: ratingCount,
      bestRating: 5,
      worstRating: 1,
    }
    : undefined;

  return {
    aggregateRating,
    review: validReviews,
  };
}
