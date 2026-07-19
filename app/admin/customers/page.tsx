import { CustomerTable } from "@/components/admin/CustomerTable";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type ProfileRow = { id: string; email: string | null; full_name: string | null; phone: string | null; role: string; created_at: string };
type CustomerRow = { id: string; profile_id: string | null; email: string | null; full_name: string | null; phone: string | null };

export default async function AdminCustomersPage() {
  const actor = await requirePermission("customers.read");
  if (!actor) redirect("/login?next=/admin/customers");
  const admin = createAdminClient() as any;
  const [{ data: profilesData }, { data: customersData }, { data: ordersData }, authResult] = admin
    ? await Promise.all([
        admin.from("profiles").select("id,email,full_name,phone,role,created_at").order("created_at", { ascending: false }),
        admin.from("customers").select("id,profile_id,email,full_name,phone"),
        admin.from("orders").select("customer_id"),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: { users: [] } }];
  const profiles = (profilesData ?? []) as ProfileRow[];
  const customers = (customersData ?? []) as CustomerRow[];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const customerByProfileId = new Map(customers.filter((customer) => customer.profile_id).map((customer) => [customer.profile_id as string, customer]));
  const orderCountByCustomerId = new Map<string, number>();
  for (const order of ordersData ?? []) if (order.customer_id) orderCountByCustomerId.set(order.customer_id, (orderCountByCustomerId.get(order.customer_id) ?? 0) + 1);
  const rows = (authResult?.data?.users ?? [])
    .filter((user: any) => (profileById.get(user.id)?.role ?? "customer") === "customer")
    .map((user: any) => {
      const profile = profileById.get(user.id);
      const customer = customerByProfileId.get(user.id);
      const metadata = user.user_metadata ?? {};
      return {
        id: user.id,
        fullName: profile?.full_name || customer?.full_name || metadata.full_name || metadata.name || null,
        email: profile?.email || customer?.email || user.email || null,
        phone: profile?.phone || customer?.phone || user.phone || metadata.phone || null,
        provider: String(user.app_metadata?.provider ?? user.identities?.[0]?.provider ?? "email"),
        orders: customer ? orderCountByCustomerId.get(customer.id) ?? 0 : 0,
        createdAt: profile?.created_at || user.created_at,
      };
    });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">People</p>
        <h1 className="mt-3 text-4xl font-medium">მომხმარებლები</h1>
        <p className="mt-3 text-sm text-hooma-muted">Supabase Auth-ში რეგისტრირებული მომხმარებლები — Google და ელფოსტით შექმნილი ანგარიშები ერთიან სიაში.</p>
      </div>
      <CustomerTable customers={rows} />
    </div>
  );
}
