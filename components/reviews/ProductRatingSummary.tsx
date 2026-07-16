import { ShoppingBag, Star } from "lucide-react";

export function ProductRatingSummary({
  average,
  ratingCount,
  salesCount,
  language = "ka",
  detailed = false,
}: {
  average: number;
  ratingCount: number;
  salesCount: number;
  language?: "ka" | "en";
  detailed?: boolean;
}) {
  const hasRatings = ratingCount > 0;
  const ratingLabel = hasRatings ? average.toFixed(1) : language === "ka" ? "ახალი" : "New";
  const salesLabel = language === "ka" ? `${salesCount} გაყიდვა` : `${salesCount} sold`;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-hooma-muted" aria-label={`${ratingLabel}; ${ratingCount} reviews; ${salesLabel}`}>
      <span className="inline-flex items-center gap-1.5 font-semibold text-hooma-text">
        {detailed ? (
          <span className="inline-flex gap-0.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} size={14} className={star <= Math.round(average) ? "fill-amber-400 text-amber-400" : "text-hooma-text/20"} />
            ))}
          </span>
        ) : <Star size={14} className={hasRatings ? "fill-amber-400 text-amber-400" : "text-hooma-text/25"} />}
        {ratingLabel}
      </span>
      <span>{hasRatings ? `(${ratingCount})` : language === "ka" ? "ჯერ შეფასება არ აქვს" : "No reviews yet"}</span>
      <span className="inline-flex items-center gap-1.5"><ShoppingBag size={13} />{salesLabel}</span>
    </div>
  );
}
