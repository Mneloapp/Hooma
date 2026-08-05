import { redirect } from "next/navigation";
import { AccountSettingsPanel } from "@/components/account/AccountSettingsPanel";
import { getSessionUser } from "@/lib/supabase/server";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ email_change?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account/settings");
  const query = await searchParams;

  const providers = new Set<string>();
  if (typeof user.app_metadata?.provider === "string") providers.add(user.app_metadata.provider);
  if (Array.isArray(user.app_metadata?.providers)) {
    user.app_metadata.providers.forEach((provider: unknown) => {
      if (typeof provider === "string") providers.add(provider);
    });
  }
  user.identities?.forEach((identity) => providers.add(identity.provider));

  const passwordIdentity = providers.has("email");
  const externalProvider = Array.from(providers).find((provider) => provider !== "email") ?? null;

  return (
    <AccountSettingsPanel
      currentEmail={user.email ?? "—"}
      emailConfirmed={Boolean(user.email_confirmed_at)}
      passwordIdentity={passwordIdentity}
      externalProvider={externalProvider}
      emailChangeStatus={query.email_change === "confirmed" || query.email_change === "pending" ? query.email_change : null}
    />
  );
}
