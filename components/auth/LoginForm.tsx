"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { loginAction } from "@/app/auth/actions";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

export function LoginForm({ next = "/account" }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, {});

  return (
    <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <GoogleSignInButton next={next} />
      <div className="my-5 flex items-center gap-3 text-xs text-hooma-muted"><span className="h-px flex-1 bg-hooma-text/10" />ან ელფოსტით<span className="h-px flex-1 bg-hooma-text/10" /></div>
      <form action={action} className="space-y-5">
        <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium">
        ელფოსტა
        <input name="email" type="email" required className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      <label className="block text-sm font-medium">
        პაროლი
        <input name="password" type="password" required className="mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" />
      </label>
      {state.message ? <p className="text-sm text-hooma-muted">{state.message}</p> : null}
        <Button className="w-full" disabled={pending}>{pending ? "მიმდინარეობს შესვლა..." : "შესვლა"}</Button>
      </form>
    </div>
  );
}
