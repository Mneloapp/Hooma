import { updateProfileAction } from "@/app/auth/actions";
import { getProfile } from "@/lib/supabase/server";
import { LocalizedText } from "@/components/LocalizedText";
import { AccountProfileForm } from "@/components/account/AccountProfileForm";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export default async function AccountPage() {
  const profile = await getProfile();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted"><LocalizedText ka="პროფილი" en="Profile" /></p>
        <h1 className="mt-3 text-4xl font-medium"><LocalizedText ka="ანგარიშის მიმოხილვა" en="Account overview" /></h1>
      </div>
      <AccountProfileForm fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} action={updateProfileAction} />
      <Link href="/account/hooma-plus" className="block rounded-[2rem] border border-hooma-accent/25 bg-gradient-to-br from-white to-hooma-panel/70 p-6 shadow-soft transition hover:-translate-y-0.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-hooma-accent"><Sparkles size={18} />Hooma+</div>
        <h2 className="mt-3 text-xl font-medium"><LocalizedText ka="უფასო მიწოდების წევრობა" en="Free-delivery membership" /></h2>
        <p className="mt-2 text-sm leading-6 text-hooma-muted"><LocalizedText ka="ნახე პირველი 10 პროდუქტის უფასო მიწოდების ბალანსი ან აირჩიე 35₾-იანი თვიური და 350₾-იანი წლიური გეგმა." en="See your first-10-product free-delivery balance or choose the ₾35 monthly and ₾350 annual plans." /></p>
      </Link>
      <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-medium"><LocalizedText ka="ბოლო შეკვეთები" en="Recent orders" /></h2>
        <p className="mt-3 text-hooma-muted"><LocalizedText ka="შეკვეთის გაფორმების შემდეგ მოთხოვნები აქ გამოჩნდება." en="Your order requests will appear here after checkout." /></p>
      </div>
    </div>
  );
}
