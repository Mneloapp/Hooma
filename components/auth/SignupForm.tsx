"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { signupAction } from "@/app/auth/actions";

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, {});

  return (
    <form action={action} className="space-y-5 rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <label className="block text-sm font-medium">
        Full name
        <input name="full_name" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        Phone
        <input name="phone" className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        Email
        <input name="email" type="email" required className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        Password
        <input name="password" type="password" required minLength={6} className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      {state.message ? <p className="text-sm text-hooma-muted">{state.message}</p> : null}
      <Button className="w-full" disabled={pending}>{pending ? "Creating account..." : "Create account"}</Button>
    </form>
  );
}
