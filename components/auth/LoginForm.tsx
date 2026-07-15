"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { googleLoginAction, loginAction } from "@/app/auth/actions";

export function LoginForm({ next = "/account" }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, {});

  return (
    <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <form action={googleLoginAction}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="flex w-full items-center justify-center gap-3 rounded-full border border-hooma-text/15 bg-white px-5 py-3 text-sm font-semibold transition hover:border-hooma-text/35">
          <GoogleMark /> Google-ით გაგრძელება
        </button>
      </form>
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

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92A6.01 6.01 0 0 1 6.08 12c0-.67.12-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"/></svg>;
}
