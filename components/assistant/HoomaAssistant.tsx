"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUp,
  Bot,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCart } from "@/components/CartContext";
import { useLanguage } from "@/components/LanguageProvider";
import { storefrontAssistantStarters } from "@/lib/storefront-assistant/knowledge";
import type {
  StorefrontAssistantAction,
  StorefrontAssistantMessage,
  StorefrontAssistantProduct,
  StorefrontAssistantReply,
} from "@/lib/storefront-assistant/types";

type ChatMessage = StorefrontAssistantMessage & {
  id: string;
  actions?: StorefrontAssistantAction[];
  products?: StorefrontAssistantProduct[];
  suggestions?: string[];
  error?: boolean;
};

const actionPaths: Record<StorefrontAssistantAction, string> = {
  shop: "/shop",
  custom_order: "/account/custom-orders",
  orders: "/account/orders",
  hooma_plus: "/hooma-plus",
  how_it_works: "/how-it-works",
  faq: "/faq",
  contact: "/contact",
  privacy: "/privacy",
  terms: "/terms",
};

const actionLabels: Record<StorefrontAssistantAction, { ka: string; en: string }> = {
  shop: { ka: "პროდუქტების ნახვა", en: "View products" },
  custom_order: { ka: "ინდივიდუალური შეკვეთა", en: "Custom order" },
  orders: { ka: "ჩემი შეკვეთები", en: "My orders" },
  hooma_plus: { ka: "Hooma+ პირობები", en: "Hooma+ details" },
  how_it_works: { ka: "როგორ მუშაობს?", en: "How it works" },
  faq: { ka: "ხშირი კითხვები", en: "FAQ" },
  contact: { ka: "მხარდაჭერასთან დაკავშირება", en: "Contact support" },
  privacy: { ka: "კონფიდენციალურობა", en: "Privacy" },
  terms: { ka: "გამოყენების პირობები", en: "Terms of use" },
};

function identifier(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initialMessage(language: "ka" | "en"): ChatMessage {
  return {
    id: "assistant-welcome",
    role: "assistant",
    content: language === "ka"
      ? "გამარჯობა 👋 მე ვარ Hooma-ს AI ასისტენტი. დაგეხმარები პროდუქტების, დამზადების, მიწოდებისა და შეკვეთის პროცესის შესახებ."
      : "Hello 👋 I’m Hooma’s AI assistant. I can help with products, production, delivery, and the ordering process.",
  };
}

function validReply(value: unknown): value is StorefrontAssistantReply {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reply = value as Record<string, unknown>;
  return typeof reply.answer === "string"
    && Array.isArray(reply.actions)
    && Array.isArray(reply.suggestions)
    && Array.isArray(reply.products);
}

export function HoomaAssistant() {
  const { language } = useLanguage();
  const { isOpen: cartOpen } = useCart();
  const pathname = usePathname();
  const georgian = language === "ka";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [initialMessage(language)]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const starters = storefrontAssistantStarters[language];
  const hidden = pathname.startsWith("/admin")
    || pathname.startsWith("/auth/")
    || pathname === "/logout";

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(georgian ? "ka-GE" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    [georgian],
  );

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = false;
    setSending(false);
    setMessages([initialMessage(language)]);
  }, [language]);

  useEffect(() => {
    if (cartOpen) setOpen(false);
  }, [cartOpen]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const backgroundElements = [
      ...document.querySelectorAll<HTMLElement>("body > header, body > main, body > footer"),
    ];
    const backgroundState = backgroundElements.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    for (const element of backgroundElements) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    else dialogRef.current?.focus();

    const handleDialogKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => launcherRef.current?.focus(), 0);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialogRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const state of backgroundState) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
        else state.element.setAttribute("aria-hidden", state.ariaHidden);
      }
      window.removeEventListener("keydown", handleDialogKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  useEffect(() => () => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = false;
  }, []);

  if (hidden || cartOpen) return null;

  const closeChat = () => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  };

  const resetConversation = () => {
    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort();
    pendingRef.current = false;
    setSending(false);
    setInput("");
    setMessages([initialMessage(language)]);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const appendError = (code?: string) => {
    const rateLimited = code === "rate_limited";
    const notConfigured = code === "assistant_not_configured";
    setMessages((current) => [
      ...current,
      {
        id: identifier("assistant-error"),
        role: "assistant",
        error: true,
        content: georgian
          ? rateLimited
            ? "ცოტა ზედიზედ ბევრი კითხვა მივიღე. გთხოვ, რამდენიმე წუთში ისევ სცადო."
            : notConfigured
              ? "AI პასუხები ჯერ სრულად არ არის გააქტიურებული. ხშირ კითხვებზე მაინც დაგეხმარები, ხოლო სხვა საკითხისთვის მოგვიანებით სცადე."
              : "ახლა პასუხის მომზადება ვერ შევძელი. გთხოვ, ცოტა ხანში ისევ სცადო."
          : rateLimited
            ? "I received too many questions in a short time. Please try again in a few minutes."
            : notConfigured
              ? "AI answers are not fully activated yet. I can still answer common questions; try other questions again later."
              : "I couldn’t prepare an answer just now. Please try again shortly.",
        actions: ["faq"],
      },
    ]);
  };

  const sendMessage = async (suggestedMessage?: string) => {
    const content = (suggestedMessage ?? input).trim().slice(0, 800);
    if (!content || pendingRef.current) return;
    pendingRef.current = true;

    const userMessage: ChatMessage = {
      id: identifier("user"),
      role: "user",
      content,
    };
    const visibleHistory = [...messages, userMessage];
    setMessages(visibleHistory);
    setInput("");
    setSending(true);

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          currentPath: pathname,
          messages: [{ role: "user", content }],
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !validReply(payload?.reply)) {
        appendError(typeof payload?.code === "string" ? payload.code : undefined);
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: identifier("assistant"),
          role: "assistant",
          content: payload.reply.answer,
          actions: payload.reply.actions,
          products: payload.reply.products,
          suggestions: payload.reply.suggestions,
        },
      ]);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) appendError();
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        pendingRef.current = false;
        setSending(false);
      }
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={georgian ? "ჩატის დახურვა" : "Close chat"}
          onClick={closeChat}
          className="fixed inset-0 z-[44] bg-hooma-text/25 backdrop-blur-[1px] sm:bg-hooma-text/10 sm:backdrop-blur-0"
        />
      ) : null}

      {open ? (
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hooma-assistant-title"
          tabIndex={-1}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-[45] flex flex-col overflow-hidden rounded-[1.65rem] border border-hooma-text/10 bg-hooma-background shadow-[0_28px_90px_rgba(36,50,74,0.28)] outline-none sm:left-auto sm:right-5 sm:w-[390px]"
          style={{
            height: "min(calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1.5rem), 640px)",
          }}
        >
          <header className="flex items-center gap-3 bg-hooma-text px-4 py-3.5 text-white">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10 text-hooma-secondary">
              <Bot size={21} />
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-hooma-text bg-emerald-400" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="hooma-assistant-title" className="truncate font-semibold">
                {georgian ? "Hooma ასისტენტი" : "Hooma Assistant"}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/60">
                <Sparkles size={11} />
                {georgian ? "AI · პასუხობს Hooma-ს შესახებ" : "AI · Answers about Hooma"}
              </p>
            </div>
            <button
              type="button"
              onClick={resetConversation}
              aria-label={georgian ? "ახალი საუბარი" : "New conversation"}
              title={georgian ? "ახალი საუბარი" : "New conversation"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-hooma-secondary"
            >
              <RotateCcw size={17} />
            </button>
            <button
              type="button"
              onClick={closeChat}
              aria-label={georgian ? "დახურვა" : "Close"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-hooma-secondary"
            >
              <X size={20} />
            </button>
          </header>

          <div
            ref={transcriptRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-busy={sending}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5"
          >
            {messages.map((message, index) => (
              <article
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[88%]">
                  <span className="sr-only">
                    {message.role === "user"
                      ? (georgian ? "თქვენ:" : "You:")
                      : (georgian ? "Hooma ასისტენტი:" : "Hooma Assistant:")}
                  </span>
                  <div
                    role={message.error ? "alert" : undefined}
                    className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "rounded-br-md bg-hooma-text text-white"
                        : message.error
                          ? "rounded-bl-md border border-hooma-accent/15 bg-white text-hooma-muted"
                          : "rounded-bl-md bg-hooma-panel text-hooma-text"
                    }`}
                  >
                    {message.content}
                  </div>

                  {message.products?.length ? (
                    <div className="mt-2.5 grid gap-2">
                      {message.products.map((product) => (
                        <Link
                          key={product.slug}
                          href={`/product/${product.slug}`}
                          className="group rounded-2xl border border-hooma-text/10 bg-white p-3 shadow-sm transition hover:border-hooma-accent/35 hover:shadow-soft"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-semibold text-hooma-text">
                                {georgian ? product.nameKa : product.nameEn}
                              </p>
                              <p className="mt-1 text-[11px] text-hooma-muted">
                                {georgian ? product.categoryKa : product.categoryEn}
                              </p>
                            </div>
                            <ExternalLink size={15} className="mt-0.5 shrink-0 text-hooma-accent" />
                          </div>
                          <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-hooma-text/10 pt-2.5 text-xs">
                            <span className="font-semibold text-hooma-accent">
                              {product.startingPrice === null
                                ? (georgian ? "ფასი გვერდზე" : "Price on page")
                                : georgian
                                  ? `₾${numberFormatter.format(product.startingPrice)}-დან`
                                  : `From ₾${numberFormatter.format(product.startingPrice)}`}
                            </span>
                            <span className="flex items-center gap-1 text-hooma-muted">
                              <Clock3 size={12} />
                              {product.leadTimeDays} {georgian ? "სამუშაო დღე" : "business days"}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {message.actions?.length ? (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {message.actions.map((action) => (
                        <Link
                          key={action}
                          href={actionPaths[action]}
                          className="inline-flex min-h-9 items-center rounded-full border border-hooma-text/10 bg-white px-3 text-xs font-semibold text-hooma-accent transition hover:border-hooma-accent/35"
                        >
                          {actionLabels[action][language]}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {message.role === "assistant" && message.suggestions?.length && index === messages.length - 1 ? (
                    <div className="mt-2.5 grid gap-2">
                      {message.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          disabled={sending}
                          onClick={() => void sendMessage(suggestion)}
                          className="rounded-xl border border-hooma-text/10 bg-white px-3 py-2 text-left text-xs text-hooma-muted transition hover:border-hooma-accent/35 hover:text-hooma-text disabled:opacity-50"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}

            {messages.length === 1 ? (
              <div className="grid gap-2">
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void sendMessage(starter)}
                    className="rounded-2xl border border-hooma-text/10 bg-white px-4 py-3 text-left text-sm text-hooma-text transition hover:border-hooma-accent/35 hover:shadow-sm"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : null}

            {sending ? (
              <div role="status" className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-hooma-panel px-4 py-3 text-xs text-hooma-muted">
                  <LoaderCircle size={15} className="animate-spin" />
                  {georgian ? "პასუხს ვამზადებ…" : "Preparing an answer…"}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-hooma-text/10 bg-white/85 px-3 pb-3 pt-3 backdrop-blur">
            <form onSubmit={submit} className="flex items-end gap-2">
              <label htmlFor="hooma-assistant-input" className="sr-only">
                {georgian ? "დაწერე კითხვა" : "Type a question"}
              </label>
              <input
                ref={inputRef}
                id="hooma-assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                maxLength={800}
                readOnly={sending}
                autoComplete="off"
                placeholder={georgian ? "დაწერე კითხვა…" : "Type a question…"}
                className="min-h-11 min-w-0 flex-1 rounded-full border border-hooma-text/10 bg-hooma-background px-4 text-base text-hooma-text outline-none transition placeholder:text-hooma-muted/65 focus:border-hooma-accent read-only:opacity-60"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label={georgian ? "გაგზავნა" : "Send"}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-hooma-accent text-white transition hover:bg-hooma-accent/90 focus:outline-none focus:ring-2 focus:ring-hooma-secondary disabled:cursor-not-allowed disabled:opacity-45"
              >
                {sending ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowUp size={18} />}
              </button>
            </form>
            <p className="mt-2 flex items-start gap-1.5 px-1 text-[10px] leading-4 text-hooma-muted">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" />
              <span>
                {georgian
                  ? "არ გააგზავნო პაროლი, ბარათის მონაცემები ან სხვა მგრძნობიარე ინფორმაცია."
                  : "Do not send passwords, card details, or other sensitive information."}
                {" "}
                <Link href="/privacy" className="underline underline-offset-2">
                  {georgian ? "დეტალურად" : "Learn more"}
                </Link>
              </span>
            </p>
          </div>
        </section>
      ) : null}

      {!open ? (
        <button
          ref={launcherRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={georgian ? "Hooma ასისტენტის გახსნა" : "Open Hooma Assistant"}
          className="fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-hooma-text text-white shadow-[0_16px_40px_rgba(36,50,74,0.3)] transition hover:-translate-y-1 hover:bg-hooma-accent focus:outline-none focus:ring-4 focus:ring-hooma-secondary/60 sm:right-5"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          <MessageCircle size={24} />
          <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-hooma-background bg-emerald-400" />
        </button>
      ) : null}
    </>
  );
}
