"use client";

import { LoaderCircle, Send } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { contactTopicLabels, contactTopics } from "@/lib/contact/core";

type FormStatus = {
  kind: "success" | "error";
  message: string;
} | null;

function submissionId() {
  return window.crypto.randomUUID();
}

type LogicalRequest = {
  id: string;
  payload: string;
};

export function ContactForm({ enabled }: { enabled: boolean }) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatus>(null);
  const logicalRequest = useRef<LogicalRequest | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enabled || busy) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const requestPayload = {
      language,
      topic: form.get("topic"),
      name: form.get("name"),
      email: form.get("email"),
      phone: form.get("phone"),
      orderReference: form.get("order_reference"),
      subject: form.get("subject"),
      message: form.get("message"),
      website: form.get("website"),
    };
    const serializedPayload = JSON.stringify(requestPayload);
    const activeRequest = logicalRequest.current?.payload === serializedPayload
      ? logicalRequest.current
      : { id: submissionId(), payload: serializedPayload };
    logicalRequest.current = activeRequest;
    setBusy(true);
    setStatus(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: activeRequest.id,
          ...requestPayload,
        }),
      });
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || payload?.ok !== true || typeof payload.reference !== "string") {
        const code = typeof payload?.code === "string" ? payload.code : "contact_unavailable";
        const rateLimited = code === "rate_limited";
        const invalidRequest = code === "invalid_request" || code === "request_too_large";
        setStatus({
          kind: "error",
          message: rateLimited
            ? (georgian
              ? "ძალიან ბევრი მოთხოვნა გაიგზავნა. ცოტა ხანში სცადე ხელახლა ან მოგვწერე support@hooma.ge-ზე."
              : "Too many requests were sent. Try again later or email support@hooma.ge.")
            : invalidRequest
              ? (georgian
                ? "შეამოწმე ველები და ამოიღე პაროლი ან საბანკო ბარათის მონაცემები. შეტყობინება არ გაგზავნილა."
                : "Check the fields and remove any password or payment-card data. The message was not sent.")
            : (georgian
              ? "შეტყობინება ვერ გაიგზავნა. მონაცემები არ დაგიკარგავს — სცადე ხელახლა ან მოგვწერე support@hooma.ge-ზე."
              : "The message could not be sent. Your entries are still here—try again or email support@hooma.ge."),
        });
        return;
      }

      const replyEmail = String(form.get("email") ?? "");
      setStatus({
        kind: "success",
        message: georgian
          ? `შეტყობინება მიღებულია. მოთხოვნის კოდია ${payload.reference}. პასუხს ${replyEmail}-ზე მიიღებ.`
          : `Message received. Your reference is ${payload.reference}. We will reply to ${replyEmail}.`,
      });
      formElement.reset();
      logicalRequest.current = null;
    } catch {
      setStatus({
        kind: "error",
        message: georgian
          ? "კავშირი ვერ დამყარდა. მონაცემები არ დაგიკარგავს — სცადე ხელახლა ან მოგვწერე support@hooma.ge-ზე."
          : "We could not connect. Your entries are still here—try again or email support@hooma.ge.",
      });
    } finally {
      setBusy(false);
    }
  };

  const editAfterFailure = () => {
    if (status?.kind !== "error") return;
    setStatus(null);
  };

  const fieldClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-4 py-3 outline-none transition focus:border-hooma-accent focus:ring-2 focus:ring-hooma-accent/15";

  return (
    <form onSubmit={submit} onChange={editAfterFailure} className="rounded-[2rem] border border-hooma-text/10 bg-white/80 p-5 shadow-soft sm:p-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-accent">
          {georgian ? "საკონტაქტო ფორმა" : "Contact form"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold">{georgian ? "მოგვწერე" : "Send us a message"}</h2>
        <p className="mt-2 text-sm leading-6 text-hooma-muted">
          {georgian
            ? "მიუთითე ელფოსტა, რომელზეც პასუხის მიღება გსურს. ვარსკვლავით მონიშნული ველები აუცილებელია."
            : "Enter the email where you want to receive our reply. Fields marked with an asterisk are required."}
        </p>
      </div>

      <fieldset disabled={!enabled || busy} className="mt-6 border-0 p-0 disabled:opacity-70">
        <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">
          {georgian ? "სახელი და გვარი *" : "Full name *"}
          <input name="name" autoComplete="name" required minLength={2} maxLength={100} className={fieldClass} />
        </label>
        <label className="text-sm font-medium">
          {georgian ? "ელფოსტა *" : "Email *"}
          <input name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} className={fieldClass} />
        </label>
        <label className="text-sm font-medium">
          {georgian ? "ტელეფონი (არასავალდებულო)" : "Phone (optional)"}
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} className={fieldClass} />
        </label>
        <label className="text-sm font-medium">
          {georgian ? "საკითხის ტიპი *" : "Topic *"}
          <select name="topic" required defaultValue="order" className={fieldClass}>
            {contactTopics.map((topic) => (
              <option key={topic} value={topic}>{contactTopicLabels[topic][language]}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          {georgian ? "შეკვეთის ან ტრეკინგის კოდი (თუ გაქვს)" : "Order or tracking reference (if available)"}
          <input name="order_reference" maxLength={64} autoComplete="off" className={fieldClass} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          {georgian ? "სათაური *" : "Subject *"}
          <input name="subject" required minLength={3} maxLength={140} className={fieldClass} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          {georgian ? "შეტყობინება *" : "Message *"}
          <textarea name="message" required minLength={20} maxLength={4000} rows={7} className={`${fieldClass} rounded-[1.25rem] resize-y`} />
        </label>
        </div>

        <label className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </fieldset>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        {georgian
          ? "არ გამოგვიგზავნო პაროლი, ბარათის სრული ნომერი, CVV ან ერთჯერადი კოდი. ფოტოს ან ფაილისთვის მოგვწერე პირდაპირ support@hooma.ge-ზე."
          : "Never send a password, full card number, CVV, or one-time code. To attach a photo or file, email support@hooma.ge directly."}
      </div>

      {!enabled ? (
        <p role="alert" className="mt-5 rounded-xl bg-hooma-panel p-4 text-sm leading-6 text-hooma-muted">
          {georgian ? "ონლაინ ფორმა ჯერ აქტივაციის პროცესშია. მანამდე მოგვწერე " : "The online form is being activated. In the meantime, email "}
          <a href="mailto:support@hooma.ge" className="font-semibold text-hooma-accent underline underline-offset-4">support@hooma.ge</a>.
        </p>
      ) : null}

      {status ? (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`mt-5 rounded-xl p-4 text-sm leading-6 ${status.kind === "success" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}
        >
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!enabled || busy}
        className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white transition hover:bg-hooma-accent focus:outline-none focus:ring-2 focus:ring-hooma-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
        {busy
          ? (georgian ? "იგზავნება..." : "Sending...")
          : (georgian ? "შეტყობინების გაგზავნა" : "Send message")}
      </button>
    </form>
  );
}
