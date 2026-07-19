import { updateProfileAction } from "@/app/auth/actions";
import { getProfile } from "@/lib/supabase/server";
import { LocalizedText } from "@/components/LocalizedText";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";

export default async function AccountPage() {
  const profile = await getProfile();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted"><LocalizedText ka="პროფილი" en="Profile" /></p>
        <h1 className="mt-3 text-4xl font-medium"><LocalizedText ka="ანგარიშის მიმოხილვა" en="Account overview" /></h1>
      </div>
      <AccountProfileForm fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} action={updateProfileAction} />
      <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-medium"><LocalizedText ka="ბოლო შეკვეთები" en="Recent orders" /></h2>
        <p className="mt-3 text-hooma-muted"><LocalizedText ka="შეკვეთის გაფორმების შემდეგ მოთხოვნები აქ გამოჩნდება." en="Your order requests will appear here after checkout." /></p>
      </div>
    </div>
  );
}
