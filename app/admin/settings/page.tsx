import { CostSettingsEditor, type MaterialCostProfile, type PricingProfile } from "@/components/admin/CostSettingsEditor";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminSettingsPage({ searchParams }: { searchParams: SearchParameters }) {
  const supabase = (await createClient()) as any;
  const [materialsResult, pricingResult, profile, query] = await Promise.all([
    ...(supabase ? [
    supabase.from("material_cost_profiles").select("*").eq("is_active", true).order("code"),
    supabase.from("pricing_profiles").select("*").eq("is_default", true).maybeSingle(),
    ] : [Promise.resolve({ data: [], error: null }), Promise.resolve({ data: null, error: null })]),
    getProfile(),
    searchParams,
  ]);
  const setupMissing = Boolean(materialsResult.error || pricingResult.error);
  const isOwner = profile?.role === "owner";
  const admin = isOwner ? (createAdminClient() as any) : null;
  const connectionResult = admin
    ? await admin
      .from("social_connections")
      .select("provider,username,status,access_expires_at,last_refreshed_at,last_error_code")
      .eq("provider", "instagram")
      .maybeSingle()
    : { data: null, error: null };
  const provider = singleValue(query.social_provider);
  const oauthResult = singleValue(query.social_result);
  const validResult = provider === "instagram"
    && new Set(["connected", "denied", "failed", "state_rejected"]).has(oauthResult ?? "")
    ? oauthResult
    : null;
  const instagramConnection = connectionResult.data as {
    username: string;
    status: string;
    access_expires_at: string;
    last_refreshed_at: string | null;
    last_error_code: string | null;
  } | null;

  return <div className="space-y-6">
    <div>
      <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Costing & pricing</p>
      <h1 className="mt-3 text-4xl font-medium">თვითღირებულება და ფასები</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">აქ განსაზღვრავ მასალის, პრინტერის დროის, შრომის, შეფუთვის, დანაკარგის, მარჟისა და დღგ-ის წესებს. მომხმარებელი ამ მონაცემებს ვერ ხედავს.</p>
    </div>
    {isOwner ? <section className="rounded-3xl border border-hooma-line bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">Social connections</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-medium">Instagram</h2>
          {instagramConnection ? <p className="mt-2 text-sm text-hooma-muted">
            @{instagramConnection.username} · {instagramConnection.status === "active" ? "დაკავშირებულია" : "ხელახალი ავტორიზაციაა საჭირო"}
          </p> : <p className="mt-2 text-sm text-hooma-muted">ანგარიში ჯერ არ არის დაკავშირებული.</p>}
          {validResult === "connected" ? <p className="mt-2 text-sm text-emerald-700">Instagram წარმატებით დაუკავშირდა.</p> : null}
          {validResult && validResult !== "connected" ? <p className="mt-2 text-sm text-rose-700">Instagram-ის ავტორიზაცია ვერ დასრულდა ({validResult}). ხელახლა სცადე მხოლოდ ამავე ანგარიშით.</p> : null}
          {connectionResult.error ? <p className="mt-2 text-sm text-amber-800">Social connection-ის საცავი ჯერ არ არის გააქტიურებული.</p> : null}
        </div>
        <a
          href="https://hooma.ge/api/social/oauth/instagram/start"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-hooma-ink px-5 py-3 text-sm font-medium text-white"
        >
          {instagramConnection?.status === "active" ? "Instagram-ის ხელახლა დაკავშირება" : "Instagram-ის დაკავშირება"}
        </a>
      </div>
    </section> : null}
    {setupMissing ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Costing სისტემა ჯერ არ არის გააქტიურებული — გაუშვი ბოლო Supabase migration.</div> : <CostSettingsEditor materials={(materialsResult.data ?? []) as MaterialCostProfile[]} pricing={(pricingResult.data as PricingProfile | null) ?? null} />}
  </div>;
}
