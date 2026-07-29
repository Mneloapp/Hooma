"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, FlaskConical, LoaderCircle } from "lucide-react";
import { setProductPublicationAction } from "@/app/admin/products/actions";

function Result({ state }: { state: { ok?: boolean; message?: string } }) {
  return state.message ? <p aria-live="polite" className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : null;
}

export function ProductPublicationControls({ productId, slug, status, priceReady, publicReady, auditApproved, storefrontVisible }: { productId: string; slug: string; status: string; priceReady: boolean; publicReady: boolean; auditApproved: boolean; storefrontVisible: boolean }) {
  const [publicationState, publicationAction, publicationPending] = useActionState(setProductPublicationAction, {});
  const router = useRouter();

  useEffect(() => {
    if (publicationState.ok) router.refresh();
  }, [publicationState.ok, router]);

  const active = status === "active";
  const publiclyVisible = storefrontVisible;
  const heading = publiclyVisible
    ? "პროდუქტის გამოქვეყნება"
    : active
      ? auditApproved
        ? "Active, მაგრამ საჯარო ბარათი არ აქვს"
        : "Active, მაგრამ საჯაროდ დამალულია"
      : !auditApproved
        ? "ჯერ Audit Agent-ის დამტკიცებაა საჭირო"
        : !publicReady
          ? "Admin publication confirmation"
          : "პროდუქტის გამოქვეყნება";
  const description = publiclyVisible
    ? "პროდუქტი საჯარო კატალოგში ჩანს."
    : active
      ? auditApproved
        ? "აუდიტი დამტკიცებულია, მაგრამ საჯარო ბარათი ვერ შეიქმნა. გადაამოწმე აქტიური ვარიანტი, ფასი, production სტატუსი და წყაროს/მედიის გამოქვეყნების უფლება."
        : "პროდუქტის სტატუსი Active დარჩა, მაგრამ მიმდინარე ვერსიას მენეჯერის მიერ დამტკიცებული აუდიტი არ აქვს და მომხმარებელი მას ვერ ხედავს. გაუშვი ხელახლა Audit Agent-ში და დაამტკიცე შედეგი."
      : !auditApproved
        ? "გაუშვი პროდუქტი Audit Agent-ში და მიღებული ტექსტი, ფოტოები, ფერები და ზომა მენეჯერის მხრიდან დაამტკიცე. ამის შემდეგ გამოქვეყნება გაიხსნება."
        : !publicReady
          ? "გადაამოწმე პროდუქტის მონაცემები, წყაროს რეფერენსი, მედია და მისი გამოქვეყნების უფლება. დადასტურება audit log-ში შეინახება."
          : "Admin-ს ან Owner-ს შეუძლია პროდუქტის გამოქვეყნება.";

  return (
    <form
      action={publicationAction}
      className={`rounded-[1.5rem] border p-6 shadow-soft ${
        publiclyVisible
          ? "border-emerald-950 bg-emerald-950 text-white"
          : !auditApproved
            ? "border-amber-200 bg-amber-50"
            : !publicReady
              ? "border-blue-200 bg-blue-50"
              : "border-hooma-text/10 bg-white/75"
      }`}
    >
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="publish" value={active ? "false" : "true"} />
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-3">
            {!publiclyVisible && (!publicReady || !auditApproved) ? <FlaskConical size={19} /> : null}
            <h2 className="text-xl font-semibold">{heading}</h2>
            <span className={`rounded-full px-3 py-1 text-xs ${publiclyVisible ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>
              {status}
            </span>
          </div>
          <p className={`mt-2 text-sm leading-6 ${publiclyVisible ? "text-white/65" : !auditApproved ? "text-amber-950/75" : !publicReady ? "text-blue-900/70" : "text-hooma-muted"}`}>
            {description}
          </p>
          {!active && auditApproved && !publicReady ? (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-white/75 p-4 text-sm font-medium leading-6 text-blue-950">
              <input type="checkbox" name="confirm_publication_review" value="true" required className="mt-1 h-4 w-4 shrink-0 accent-blue-950" />
              <span>ვადასტურებ, რომ გადავხედე წყაროსა და მედიას და მაქვს ამ პროდუქტის Hooma-ზე გამოქვეყნების უფლებამოსილება.</span>
            </label>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {!active ? priceReady ? (
            <Link href={`/product/${slug}?preview=${productId}`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-current/15 bg-white px-5 py-3 text-sm font-semibold text-blue-950">
              <Eye size={16} />Preview
            </Link>
          ) : (
            <span className="rounded-xl bg-white/70 px-5 py-3 text-sm font-semibold text-blue-900/60">ჯერ შეავსე ფასი</span>
          ) : null}
          <button
            disabled={publicationPending || (!active && (!priceReady || !auditApproved))}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-40 ${publiclyVisible ? "bg-white text-emerald-950" : active ? "bg-amber-900 text-white" : !publicReady ? "bg-blue-950 text-white" : "bg-hooma-accent text-white"}`}
          >
            {publicationPending ? <LoaderCircle size={16} className="animate-spin" /> : active ? <EyeOff size={16} /> : !publicReady ? <CheckCircle2 size={16} /> : <Eye size={16} />}
            {active ? publiclyVisible ? "გამოქვეყნებიდან მოხსნა" : "Active სტატუსის მოხსნა" : !auditApproved ? "აუდიტის დამტკიცება აკლია" : !publicReady ? "დადასტურება და გამოქვეყნება" : "გამოქვეყნება"}
          </button>
          {publicationState.ok && publicationState.completedPublication ? (
            <Link href={publicationState.nextDraftId ? `/admin/products/${publicationState.nextDraftId}` : "/admin/products"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-emerald-950">
              <ArrowRight size={16} />{publicationState.nextDraftId ? "შემდეგ Draft-ზე" : "პროდუქტების სიაზე"}
            </Link>
          ) : null}
        </div>
      </div>
      <Result state={publicationState} />
    </form>
  );
}
