"use client";

import { useEffect, useRef, useState } from "react";
import { googleLoginAction } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentity = {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    nonce?: string;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: "standard";
      theme: "outline";
      size: "large";
      shape: "pill";
      text: "continue_with" | "signup_with";
      logo_alignment: "left";
      locale: string;
      width: number;
    },
  ): void;
};

type GoogleWindow = Window & {
  google?: { accounts: { id: GoogleIdentity } };
};

const googleScriptUrl = "https://accounts.google.com/gsi/client";
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createNoncePair() {
  const rawNonce = bytesToBase64Url(window.crypto.getRandomValues(new Uint8Array(32)));
  const hash = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawNonce));
  const hashedNonce = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { rawNonce, hashedNonce };
}

export function GoogleSignInButton({
  next,
  mode = "login",
}: {
  next: string;
  mode?: "login" | "signup";
}) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!googleClientId) return;
    let cancelled = false;

    const render = async () => {
      const google = (window as GoogleWindow).google;
      const target = buttonRef.current;
      if (!google || !target || cancelled) return;

      const { rawNonce, hashedNonce } = await createNoncePair();
      if (cancelled) return;

      google.accounts.id.initialize({
        client_id: googleClientId,
        nonce: hashedNonce,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: async (response) => {
          setError("");
          const supabase = createClient();
          if (!supabase || !response.credential) {
            setError(georgian ? "Google ავტორიზაცია ვერ დასრულდა. სცადე ხელახლა." : "Google sign-in could not be completed. Please try again.");
            return;
          }

          const { error: signInError } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: response.credential,
            nonce: rawNonce,
          });

          if (signInError) {
            setError(georgian ? "Google ავტორიზაცია ვერ დასრულდა. სცადე ხელახლა." : "Google sign-in could not be completed. Please try again.");
            return;
          }

          window.location.assign(`/auth/complete?next=${encodeURIComponent(next)}`);
        },
      });

      target.replaceChildren();
      google.accounts.id.renderButton(target, {
        type: "standard",
        theme: "outline",
        size: "large",
        shape: "pill",
        text: mode === "signup" ? "signup_with" : "continue_with",
        logo_alignment: "left",
        locale: language,
        width: Math.max(240, Math.min(400, Math.floor(target.clientWidth || 400))),
      });
    };

    if ((window as GoogleWindow).google) {
      void render();
    } else {
      let script = document.querySelector<HTMLScriptElement>(`script[src="${googleScriptUrl}"]`);
      if (!script) {
        script = document.createElement("script");
        script.src = googleScriptUrl;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      return () => {
        cancelled = true;
        script?.removeEventListener("load", render);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [georgian, language, mode, next]);

  if (!googleClientId) {
    return (
      <form action={googleLoginAction}>
        <input type="hidden" name="next" value={next} />
        <button type="submit" className="flex w-full items-center justify-center gap-3 rounded-full border border-hooma-text/15 bg-white px-5 py-3 text-sm font-semibold transition hover:border-hooma-text/35">
          <GoogleMark /> {mode === "signup" ? (georgian ? "Google-ით ანგარიშის შექმნა" : "Sign up with Google") : (georgian ? "Google-ით გაგრძელება" : "Continue with Google")}
        </button>
      </form>
    );
  }

  return (
    <div>
      <div ref={buttonRef} className="flex min-h-11 w-full justify-center" />
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.92A6.01 6.01 0 0 1 6.08 12c0-.67.12-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"/></svg>;
}
