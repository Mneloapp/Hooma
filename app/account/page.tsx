import { updateProfileAction } from "@/app/auth/actions";
import { getProfile } from "@/lib/supabase/server";
import { LocalizedText } from "@/components/LocalizedText";

export default async function AccountPage() {
  const profile = await getProfile();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted"><LocalizedText ka="პროფილი" en="Profile" /></p>
        <h1 className="mt-3 text-4xl font-medium"><LocalizedText ka="ანგარიშის მიმოხილვა" en="Account overview" /></h1>
      </div>
      <form action={updateProfileAction} className="grid gap-5 rounded-[2rem] bg-white/75 p-6 shadow-soft md:grid-cols-2">
        <label className="block text-sm font-medium"><LocalizedText ka="სახელი და გვარი" en="Full name" /><input name="full_name" defaultValue={profile?.full_name ?? ""} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="block text-sm font-medium"><LocalizedText ka="ტელეფონი" en="Phone" /><input name="phone" defaultValue={profile?.phone ?? ""} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <button className="rounded-full bg-hooma-text px-5 py-3 text-sm font-medium text-white md:w-fit"><LocalizedText ka="პროფილის შენახვა" en="Save profile" /></button>
      </form>
      <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-medium"><LocalizedText ka="ბოლო შეკვეთები" en="Recent orders" /></h2>
        <p className="mt-3 text-hooma-muted"><LocalizedText ka="შეკვეთის გაფორმების შემდეგ მოთხოვნები აქ გამოჩნდება." en="Your order requests will appear here after checkout." /></p>
      </div>
    </div>
  );
}
