"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, LoaderCircle, MessageSquareText, Star, Trash2 } from "lucide-react";
import { deleteProductReviewAction, submitProductReviewAction } from "@/app/product/[slug]/review-actions";
import type { ProductReviewContext, PublicProductReview } from "@/lib/product-reviews";
import { ProductRatingSummary } from "@/components/reviews/ProductRatingSummary";
import { useLanguage } from "@/components/LanguageProvider";

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return <span className="inline-flex gap-0.5" aria-label={`${value} ვარსკვლავი`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={size} className={star <= value ? "fill-amber-400 text-amber-400" : "text-hooma-text/20"} />)}</span>;
}

export function ProductReviewsSection({
  productId,
  slug,
  productName,
  productNameEn,
  average,
  ratingCount,
  salesCount,
  reviews,
  context,
  allowReview,
}: {
  productId: string;
  slug: string;
  productName: string;
  productNameEn?: string;
  average: number;
  ratingCount: number;
  salesCount: number;
  reviews: PublicProductReview[];
  context: ProductReviewContext;
  allowReview: boolean;
}) {
  const router = useRouter();
  const { language } = useLanguage();
  const georgian = language === "ka";
  const dateFormatter = new Intl.DateTimeFormat(georgian ? "ka-GE" : "en-US", { year: "numeric", month: "long", day: "numeric" });
  const [rating, setRating] = useState(context.review?.rating ?? 5);
  const [comment, setComment] = useState(context.review?.comment ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => startTransition(async () => {
    if (!context.orderItemId) return;
    const data = new FormData();
    data.set("product_id", productId);
    data.set("order_item_id", context.orderItemId);
    data.set("slug", slug);
    data.set("rating", String(rating));
    data.set("comment", comment);
    const result = await submitProductReviewAction(data);
    setMessage(result.message);
    if (result.ok) router.refresh();
  });

  const remove = () => {
    if (!window.confirm(georgian ? "ნამდვილად წავშალოთ შენი შეფასება?" : "Delete your review?")) return;
    startTransition(async () => {
      const data = new FormData();
      data.set("product_id", productId);
      data.set("slug", slug);
      const result = await deleteProductReviewAction(data);
      setMessage(result.message);
      if (result.ok) {
        setComment("");
        setRating(5);
        router.refresh();
      }
    });
  };

  return (
    <section id="reviews" className="mt-14 scroll-mt-32 rounded-[2rem] border border-hooma-text/10 bg-white/75 p-5 shadow-sm sm:p-7 lg:p-9">
      <div className="flex flex-col justify-between gap-5 border-b border-hooma-text/10 pb-6 md:flex-row md:items-end">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-hooma-accent">{georgian ? "მომხმარებლების გამოცდილება" : "Customer experience"}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{georgian ? "შეფასებები და კომენტარები" : "Ratings and reviews"}</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">{georgian ? "რეალური მყიდველების შეფასებები" : "Reviews from verified buyers"} · {georgian ? productName : productNameEn ?? productName}</p></div>
        <ProductRatingSummary average={average} ratingCount={ratingCount} salesCount={salesCount} detailed />
      </div>

      <div className="mt-7 grid items-start gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-2xl bg-hooma-panel p-5 lg:sticky lg:top-32">
          <div className="flex items-center gap-2"><MessageSquareText size={18} className="text-hooma-accent" /><h3 className="font-semibold">{georgian ? "შენი გამოცდილება" : "Your experience"}</h3></div>
          {!allowReview ? <p className="mt-4 text-sm leading-6 text-hooma-muted">{georgian ? "სატესტო Preview-ზე შეფასების დამატება გამორთულია." : "Reviews are disabled on test previews."}</p> : !context.authenticated ? <div className="mt-4"><p className="text-sm leading-6 text-hooma-muted">{georgian ? "შეფასების დასაწერად ანგარიშში შესვლა საჭიროა." : "Sign in to write a review."}</p><Link href={`/login?next=/product/${slug}%23reviews`} className="mt-4 inline-flex rounded-xl bg-hooma-text px-4 py-2.5 text-sm font-semibold text-white">{georgian ? "ანგარიშში შესვლა" : "Sign in"}</Link></div> : !context.eligible ? <div className="mt-4 rounded-xl border border-hooma-text/10 bg-white/70 p-4"><p className="text-sm font-semibold">{georgian ? "შეფასება ხელმისაწვდომი გახდება მიწოდების შემდეგ" : "Reviews become available after delivery"}</p><p className="mt-2 text-xs leading-5 text-hooma-muted">{georgian ? "ასე თითოეულ კომენტარს რეალურ შეკვეთასთან ვაკავშირებთ და შეფასებები სანდო რჩება." : "This links every review to a real order and keeps ratings trustworthy."}</p></div> : <div className="mt-5">
            {context.review ? <p className="mb-3 text-xs font-semibold text-hooma-accent">{georgian ? "შენი არსებული შეფასების რედაქტირება" : "Edit your existing review"}</p> : null}
            <div className="flex gap-1" aria-label="აირჩიე შეფასება">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => setRating(star)} disabled={pending} aria-label={`${star} ვარსკვლავი`} aria-pressed={rating === star} className="rounded-lg p-1 transition hover:bg-white"><Star size={28} className={star <= rating ? "fill-amber-400 text-amber-400" : "text-hooma-text/25"} /></button>)}</div>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} minLength={3} maxLength={2000} rows={6} placeholder={georgian ? "რა მოგეწონა და რას გააუმჯობესებდი?" : "What did you like, and what could be improved?"} disabled={pending} className="mt-4 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-3 text-sm outline-none focus:border-hooma-accent" />
            <p className="mt-1 text-right text-[11px] text-hooma-muted">{comment.length}/2000</p>
            <button type="button" onClick={submit} disabled={pending || comment.trim().length < 3} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-hooma-text px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">{pending ? <LoaderCircle size={16} className="animate-spin" /> : null}{context.review ? (georgian ? "შეფასების განახლება" : "Update review") : (georgian ? "შეფასების გამოქვეყნება" : "Publish review")}</button>
            {context.review ? <button type="button" onClick={remove} disabled={pending} className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-red-700 hover:bg-red-50"><Trash2 size={14} />{georgian ? "შეფასების წაშლა" : "Delete review"}</button> : null}
          </div>}
          {message ? <p aria-live="polite" className="mt-4 rounded-xl bg-white/70 p-3 text-xs leading-5">{message}</p> : null}
        </aside>

        <div className="space-y-4">
          {reviews.map((review) => <article key={review.id} className="rounded-2xl border border-hooma-text/10 bg-white p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-hooma-text font-semibold text-white">{review.reviewerName.charAt(0).toUpperCase()}</span><div><p className="font-semibold">{review.reviewerName}</p>{review.verifiedPurchase ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><BadgeCheck size={13} />{georgian ? "დადასტურებული შეძენა" : "Verified purchase"}</p> : null}</div></div><div className="sm:text-right"><Stars value={review.rating} /><time className="mt-1 block text-xs text-hooma-muted">{dateFormatter.format(new Date(review.updatedAt))}</time></div></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-hooma-muted">{review.comment}</p></article>)}
          {!reviews.length ? <div className="rounded-2xl border border-dashed border-hooma-text/20 bg-hooma-panel/45 px-6 py-16 text-center"><Star size={28} className="mx-auto text-hooma-accent" /><h3 className="mt-4 text-xl font-semibold">{georgian ? "ჯერ შეფასება არ არის" : "No reviews yet"}</h3><p className="mt-2 text-sm text-hooma-muted">{georgian ? "პირველი მიწოდებული შეკვეთის შემდეგ აქ რეალური მომხმარებლის გამოცდილება გამოჩნდება." : "A real customer experience will appear here after the first delivered order."}</p></div> : null}
        </div>
      </div>
    </section>
  );
}
