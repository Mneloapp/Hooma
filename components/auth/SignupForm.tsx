"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { signupAction } from "@/app/auth/actions";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useLanguage } from "@/components/LanguageProvider";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, {});
  const { language } = useLanguage();
  const georgian = language === "ka";

  return (
    <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <GoogleSignInButton next="/account" mode="signup" />
      <div className="my-5 flex items-center gap-3 text-xs text-hooma-muted"><span className="h-px flex-1 bg-hooma-text/10" />{georgian ? "ან ელფოსტით" : "or with email"}<span className="h-px flex-1 bg-hooma-text/10" /></div>
      <form action={action} className="space-y-5">
      <input type="hidden" name="language" value={language} />
      <label className="block text-sm font-medium">
        {georgian ? "სახელი და გვარი" : "Full name"}
        <input name="full_name" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        {georgian ? "ტელეფონი" : "Phone"}
        <input name="phone" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        {georgian ? "ელფოსტა" : "Email"}
        <input name="email" type="email" required className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        {georgian ? "პაროლი" : "Password"}
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      {state.message ? <p className="text-sm text-hooma-muted">{state.message}</p> : null}
        <Button className="w-full" disabled={pending}>{pending ? (georgian ? "ანგარიში იქმნება..." : "Creating account...") : (georgian ? "ანგარიშის შექმნა" : "Create account")}</Button>
      </form>
    </div>
  );
}
