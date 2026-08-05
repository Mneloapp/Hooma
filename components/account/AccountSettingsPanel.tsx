"use client";

import Link from "next/link";
import {
  CheckCircle2,
  KeyRound,
  Languages,
  LoaderCircle,
  LogOut,
  Mail,
  MapPin,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import {
  signOutOtherSessionsAction,
  updateAccountEmailAction,
  updateAccountPasswordAction,
  type AccountSettingsActionState,
} from "@/app/account/settings/actions";
import { useLanguage } from "@/components/LanguageProvider";

const initialState: AccountSettingsActionState = {};
const inputClassName = "mt-2 w-full rounded-full border border-hooma-text/10 bg-white px-4 py-3 outline-none transition focus:border-hooma-accent focus:ring-2 focus:ring-hooma-accent/15";

function ActionStatus({ state }: { state: AccountSettingsActionState }) {
  if (!state.message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`rounded-xl px-4 py-3 text-sm font-medium ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}
    >
      {state.message}
    </p>
  );
}

function EmailSettings({ currentEmail }: { currentEmail: string }) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(updateAccountEmailAction, initialState);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.completedAt, state.ok]);

  return (
    <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-hooma-panel p-3 text-hooma-accent"><Mail size={20} /></span>
        <div>
          <h2 className="text-xl font-medium">{georgian ? "ელფოსტის შეცვლა" : "Change email"}</h2>
          <p className="mt-1 text-sm leading-6 text-hooma-muted">
            {georgian
              ? "ახალი მისამართი მხოლოდ Supabase-ის დადასტურების შემდეგ გააქტიურდება."
              : "Your new address becomes active only after Supabase confirms it."}
          </p>
        </div>
      </div>
      <p className="mt-5 rounded-2xl border border-hooma-text/10 bg-hooma-panel/50 px-4 py-3 text-sm">
        <span className="text-hooma-muted">{georgian ? "მიმდინარე ელფოსტა: " : "Current email: "}</span>
        <span className="break-all font-semibold">{currentEmail}</span>
      </p>
      <form ref={formRef} action={formAction} className="mt-5 grid gap-4 md:grid-cols-2">
        <input type="hidden" name="language" value={language} />
        <label className="block text-sm font-medium">
          {georgian ? "ახალი ელფოსტა" : "New email"}
          <input name="email" type="email" required autoComplete="email" maxLength={254} className={inputClassName} />
        </label>
        <label className="block text-sm font-medium">
          {georgian ? "მიმდინარე პაროლი" : "Current password"}
          <input name="current_password" type="password" required autoComplete="current-password" className={inputClassName} />
        </label>
        <div className="flex flex-col items-start gap-3 md:col-span-2">
          <button disabled={pending} className="inline-flex min-w-52 items-center justify-center gap-2 rounded-full bg-hooma-text px-5 py-3 text-sm font-semibold text-white transition hover:bg-hooma-text/90 disabled:cursor-wait disabled:opacity-70">
            {pending ? <LoaderCircle size={17} className="animate-spin" /> : <Mail size={17} />}
            {pending ? (georgian ? "იგზავნება..." : "Sending...") : (georgian ? "დადასტურების გაგზავნა" : "Send confirmation")}
          </button>
          <ActionStatus state={state} />
        </div>
      </form>
    </section>
  );
}

function PasswordSettings() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(updateAccountPasswordAction, initialState);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.completedAt, state.ok]);

  return (
    <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-hooma-panel p-3 text-hooma-accent"><KeyRound size={20} /></span>
        <div>
          <h2 className="text-xl font-medium">{georgian ? "პაროლის შეცვლა" : "Change password"}</h2>
          <p className="mt-1 text-sm leading-6 text-hooma-muted">
            {georgian
              ? "მიმდინარე პაროლი ამოწმებს, რომ ცვლილებას ნამდვილად შენ აკეთებ."
              : "Your current password verifies that you are making this change."}
          </p>
        </div>
      </div>
      <form ref={formRef} action={formAction} className="mt-5 grid gap-4 md:grid-cols-2">
        <input type="hidden" name="language" value={language} />
        <label className="block text-sm font-medium md:col-span-2">
          {georgian ? "მიმდინარე პაროლი" : "Current password"}
          <input name="current_password" type="password" required autoComplete="current-password" className={inputClassName} />
        </label>
        <label className="block text-sm font-medium">
          {georgian ? "ახალი პაროლი" : "New password"}
          <input name="new_password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={inputClassName} />
        </label>
        <label className="block text-sm font-medium">
          {georgian ? "გაიმეორე ახალი პაროლი" : "Repeat new password"}
          <input name="confirm_password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={inputClassName} />
        </label>
        <p className="text-xs leading-5 text-hooma-muted md:col-span-2">
          {georgian
            ? "გამოიყენე მინიმუმ 8 სიმბოლო. წარმატებული ცვლილების შემდეგ სხვა მოწყობილობებზე აქტიური სესიები დასრულდება."
            : "Use at least 8 characters. After a successful change, active sessions on other devices will be signed out."}
        </p>
        <div className="flex flex-col items-start gap-3 md:col-span-2">
          <button disabled={pending} className="inline-flex min-w-44 items-center justify-center gap-2 rounded-full bg-hooma-text px-5 py-3 text-sm font-semibold text-white transition hover:bg-hooma-text/90 disabled:cursor-wait disabled:opacity-70">
            {pending ? <LoaderCircle size={17} className="animate-spin" /> : <KeyRound size={17} />}
            {pending ? (georgian ? "იცვლება..." : "Changing...") : (georgian ? "პაროლის შეცვლა" : "Change password")}
          </button>
          <ActionStatus state={state} />
        </div>
      </form>
    </section>
  );
}

function SessionSettings() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const [state, formAction, pending] = useActionState(signOutOtherSessionsAction, initialState);

  return (
    <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-hooma-panel p-3 text-hooma-accent"><ShieldCheck size={20} /></span>
        <div>
          <h2 className="text-xl font-medium">{georgian ? "აქტიური სესიები" : "Active sessions"}</h2>
          <p className="mt-1 text-sm leading-6 text-hooma-muted">
            {georgian
              ? "თუ ანგარიში უცნობ მოწყობილობაზე გახსენი, დაასრულე ყველა სხვა სესია. ამ ბრაუზერში ავტორიზაცია დარჩება."
              : "If you used an unfamiliar device, sign out every other session. This browser will remain signed in."}
          </p>
        </div>
      </div>
      <form action={formAction} className="mt-5 flex flex-col items-start gap-3">
        <input type="hidden" name="language" value={language} />
        <button disabled={pending} className="inline-flex min-w-56 items-center justify-center gap-2 rounded-full border border-hooma-text/15 bg-white px-5 py-3 text-sm font-semibold text-hooma-text transition hover:border-hooma-text/30 hover:bg-hooma-panel disabled:cursor-wait disabled:opacity-70">
          {pending ? <LoaderCircle size={17} className="animate-spin" /> : <LogOut size={17} />}
          {pending ? (georgian ? "სესიები სრულდება..." : "Signing out sessions...") : (georgian ? "სხვა მოწყობილობებიდან გასვლა" : "Sign out other devices")}
        </button>
        <ActionStatus state={state} />
      </form>
    </section>
  );
}

export function AccountSettingsPanel({
  currentEmail,
  emailConfirmed,
  passwordIdentity,
  externalProvider,
  emailChangeStatus,
}: {
  currentEmail: string;
  emailConfirmed: boolean;
  passwordIdentity: boolean;
  externalProvider: string | null;
  emailChangeStatus: "confirmed" | "pending" | null;
}) {
  const { language, setLanguage } = useLanguage();
  const georgian = language === "ka";
  const providerName = externalProvider === "google" ? "Google" : externalProvider;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">{georgian ? "პარამეტრები" : "Settings"}</p>
        <h1 className="mt-3 text-4xl font-medium">{georgian ? "ანგარიში და უსაფრთხოება" : "Account and security"}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">
          {georgian
            ? "მართე შესვლის მონაცემები, ინტერფეისის ენა და სხვა მოწყობილობებზე გახსნილი სესიები."
            : "Manage your sign-in details, interface language, and sessions open on other devices."}
        </p>
      </div>

      {emailChangeStatus ? (
        <p role="status" className={`flex items-center gap-2 rounded-2xl px-5 py-4 text-sm font-semibold ${emailChangeStatus === "confirmed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {emailChangeStatus === "confirmed" ? <CheckCircle2 size={18} /> : <Mail size={18} />}
          {emailChangeStatus === "confirmed"
            ? (georgian ? "ახალი ელფოსტა დადასტურებულია და ანგარიშზე განახლდა." : "Your new email has been confirmed and updated on your account.")
            : (georgian ? "ერთი დადასტურება მიღებულია. უსაფრთხო ცვლილების დასასრულებლად მეორე მისამართზე მიღებული წერილიც დაადასტურე." : "One confirmation was received. Confirm the message sent to the other address to finish the secure email change.")}
        </p>
      ) : null}

      <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-hooma-panel p-3 text-hooma-accent"><Languages size={20} /></span>
          <div>
            <h2 className="text-xl font-medium">{georgian ? "ინტერფეისის ენა" : "Interface language"}</h2>
            <p className="mt-1 text-sm leading-6 text-hooma-muted">
              {georgian ? "არჩევანი ამ ბრაუზერში ავტომატურად შეინახება." : "Your choice is saved automatically in this browser."}
            </p>
          </div>
        </div>
        <div className="mt-5 inline-flex rounded-full border border-hooma-text/10 bg-white p-1" role="group" aria-label={georgian ? "ინტერფეისის ენა" : "Interface language"}>
          {(["ka", "en"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLanguage(item)}
              aria-pressed={language === item}
              className={`min-w-28 rounded-full px-4 py-2.5 text-sm font-semibold transition ${language === item ? "bg-hooma-text text-white shadow-sm" : "text-hooma-muted hover:text-hooma-text"}`}
            >
              {item === "ka" ? "ქართული" : "English"}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-hooma-text/10 bg-white/75 p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-hooma-muted">{georgian ? "შესვლის ელფოსტა" : "Sign-in email"}</p>
            <p className="mt-1 break-all text-lg font-semibold">{currentEmail}</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${emailConfirmed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {emailConfirmed ? <CheckCircle2 size={14} /> : null}
            {emailConfirmed ? (georgian ? "დადასტურებულია" : "Verified") : (georgian ? "დადასტურებას ელოდება" : "Awaiting verification")}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-hooma-muted">
          {passwordIdentity
            ? (georgian ? "შესვლის მეთოდი: ელფოსტა და პაროლი." : "Sign-in method: email and password.")
            : (georgian ? `შესვლის მეთოდი: ${providerName || "გარე პროვაიდერი"}. ელფოსტა და შესვლის მონაცემები მასთან იმართება.` : `Sign-in method: ${providerName || "external provider"}. Your email and sign-in details are managed there.`)}
        </p>
      </section>

      {passwordIdentity ? (
        <>
          <EmailSettings currentEmail={currentEmail} />
          <PasswordSettings />
        </>
      ) : (
        <section className="rounded-[2rem] border border-sky-200 bg-sky-50/80 p-6 text-sky-950">
          <div className="flex items-start gap-3">
            <ShieldCheck size={21} className="mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold">{georgian ? "ანგარიშს ცალკე Hooma პაროლი არ აქვს" : "This account has no separate Hooma password"}</h2>
              <p className="mt-2 text-sm leading-6 text-sky-900/80">
                {georgian
                  ? `${providerName || "ავტორიზაციის პროვაიდერთან"} შეცვალე ელფოსტა ან პაროლი და Hooma-ზე შესასვლელად კვლავ იგივე ღილაკი გამოიყენე.`
                  : `Change your email or password with ${providerName || "your sign-in provider"}, then continue using the same sign-in button on Hooma.`}
              </p>
            </div>
          </div>
        </section>
      )}

      <SessionSettings />

      <section className="grid gap-4 md:grid-cols-2">
        <Link href="/account" className="group rounded-[2rem] border border-hooma-text/10 bg-white/75 p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-hooma-accent/30">
          <UserRound size={20} className="text-hooma-accent" />
          <h2 className="mt-3 font-semibold">{georgian ? "სახელი და ტელეფონი" : "Name and phone"}</h2>
          <p className="mt-2 text-sm leading-6 text-hooma-muted">{georgian ? "პირადი მონაცემები ანგარიშის მიმოხილვაში შეცვალე." : "Edit your personal details in the account overview."}</p>
          <span className="mt-4 inline-block text-sm font-semibold text-hooma-accent group-hover:underline">{georgian ? "პროფილზე გადასვლა" : "Open profile"}</span>
        </Link>
        <Link href="/account/addresses" className="group rounded-[2rem] border border-hooma-text/10 bg-white/75 p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-hooma-accent/30">
          <MapPin size={20} className="text-hooma-accent" />
          <h2 className="mt-3 font-semibold">{georgian ? "მიწოდების მისამართი" : "Delivery address"}</h2>
          <p className="mt-2 text-sm leading-6 text-hooma-muted">{georgian ? "შეცვალე მიმღები, მისამართი და რუკაზე მონიშნული წერტილი." : "Edit the recipient, address, and map pin."}</p>
          <span className="mt-4 inline-block text-sm font-semibold text-hooma-accent group-hover:underline">{georgian ? "მისამართებზე გადასვლა" : "Open addresses"}</span>
        </Link>
      </section>
    </div>
  );
}
