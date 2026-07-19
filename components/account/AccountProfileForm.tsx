"use client";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import type { ProfileActionState } from "@/app/auth/actions";
import { useLanguage } from "@/components/LanguageProvider";
const initialState: ProfileActionState = {};
export function AccountProfileForm({ fullName, phone, action }: { fullName: string; phone: string; action: (state: ProfileActionState, formData: FormData) => Promise<ProfileActionState> }) {
  const { language } = useLanguage(); const georgian = language === "ka";
  const [state, formAction, pending] = useActionState(action, initialState); const [dirty, setDirty] = useState(false);
  useEffect(() => { if (state.ok) setDirty(false); }, [state.savedAt, state.ok]);
  const saved = state.ok && !dirty;
  return <form action={formAction} onChange={() => setDirty(true)} className="grid gap-5 rounded-[2rem] bg-white/75 p-6 shadow-soft md:grid-cols-2">
    <input type="hidden" name="language" value={language} />
    <label className="block text-sm font-medium">{georgian ? "სახელი და გვარი" : "Full name"}<input name="full_name" autoComplete="name" defaultValue={fullName} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
    <label className="block text-sm font-medium">{georgian ? "ტელეფონი" : "Phone"}<input name="phone" type="tel" autoComplete="tel" defaultValue={phone} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
    <div className="flex flex-col items-start gap-3 md:col-span-2"><button disabled={pending} className={`inline-flex min-w-44 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-wait ${saved ? "bg-emerald-600" : "bg-hooma-text hover:bg-hooma-text/90"}`}>{pending ? <LoaderCircle size={17} className="animate-spin" /> : saved ? <CheckCircle2 size={17} /> : null}{pending ? (georgian ? "ინახება..." : "Saving...") : saved ? (georgian ? "შენახულია" : "Saved") : (georgian ? "პროფილის შენახვა" : "Save profile")}</button>{state.message ? <p role="status" aria-live="polite" className={`rounded-xl px-4 py-3 text-sm font-medium ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p> : null}</div>
  </form>;
}
