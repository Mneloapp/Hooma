"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { googleLoginAction, signupAction } from "@/app/auth/actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, {});

  return (
    <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <form action={googleLoginAction}>
        <input type="hidden" name="next" value="/account" />
        <button type="submit" className="flex w-full items-center justify-center gap-3 rounded-full border border-hooma-text/15 bg-white px-5 py-3 text-sm font-semibold transition hover:border-hooma-text/35">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-base font-bold text-[#4285F4]">G</span> Google-ით ანგარიშის შექმნა
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-hooma-muted"><span className="h-px flex-1 bg-hooma-text/10" />ან ელფოსტით<span className="h-px flex-1 bg-hooma-text/10" /></div>
      <form action={action} className="space-y-5">
      <label className="block text-sm font-medium">
        სახელი და გვარი
        <input name="full_name" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        ტელეფონი
        <input name="phone" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        ელფოსტა
        <input name="email" type="email" required className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        პაროლი
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      {state.message ? <p className="text-sm text-hooma-muted">{state.message}</p> : null}
        <Button className="w-full" disabled={pending}>{pending ? "ანგარიში იქმნება..." : "ანგარიშის შექმნა"}</Button>
      </form>
    </div>
  );
}
