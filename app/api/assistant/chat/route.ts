import { NextResponse } from "next/server";
import {
  getDirectStorefrontAnswer,
  shouldUseProductContextForQuestion,
} from "@/lib/storefront-assistant/knowledge";
import {
  containsSensitiveData,
  sensitiveDataReply,
} from "@/lib/storefront-assistant/privacy";
import {
  generateStorefrontAssistantReply,
  isSameOriginAssistantRequest,
  readStorefrontAssistantRequest,
  requestBodyTooLarge,
  StorefrontAssistantError,
} from "@/lib/storefront-assistant/server";
import type { StorefrontAssistantLanguage, StorefrontAssistantReply } from "@/lib/storefront-assistant/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...headers,
    },
  });
}

function moderatedReply(language: StorefrontAssistantLanguage): StorefrontAssistantReply {
  return {
    answer: language === "ka"
      ? "ამ მოთხოვნაზე პასუხს ვერ გაგცემ. შემიძლია დაგეხმარო Hooma-ს პროდუქტების, შეკვეთის, დამზადებისა და მიწოდების საკითხებში."
      : "I can’t help with that request. I can assist with Hooma products, ordering, production, and delivery.",
    actions: ["shop", "faq"],
    suggestions: language === "ka"
      ? ["პროდუქტები მაჩვენე", "როგორ შევუკვეთო?"]
      : ["Show me products", "How do I place an order?"],
    products: [],
    source: "knowledge",
  };
}

export async function POST(request: Request) {
  if (!isSameOriginAssistantRequest(request)) {
    return json({ ok: false, code: "forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, code: "invalid_content_type" }, 415);
  }
  if (requestBodyTooLarge(request)) {
    return json({ ok: false, code: "request_too_large" }, 413);
  }

  let input;
  try {
    input = await readStorefrontAssistantRequest(request);
  } catch (error) {
    if (error instanceof StorefrontAssistantError && error.code === "request_too_large") {
      return json({ ok: false, code: "request_too_large" }, 413);
    }
    return json({ ok: false, code: "invalid_request" }, 400);
  }

  const question = input.messages.at(-1)?.content ?? "";
  if (containsSensitiveData(question)) {
    return json({ ok: true, reply: sensitiveDataReply(input.language) });
  }
  const productSpecificQuestion = shouldUseProductContextForQuestion(input.currentPath, question);
  const directAnswer = productSpecificQuestion
    ? null
    : getDirectStorefrontAnswer(question, input.language);
  if (directAnswer) return json({ ok: true, reply: directAnswer });

  try {
    const reply = await generateStorefrontAssistantReply(request, input);
    return json({ ok: true, reply });
  } catch (error) {
    if (error instanceof StorefrontAssistantError) {
      if (error.code === "moderated") {
        return json({ ok: true, reply: moderatedReply(input.language) });
      }
      if (error.code === "rate_limited") {
        return json(
          { ok: false, code: "rate_limited" },
          429,
          { "Retry-After": String(error.retryAfterSeconds ?? 600) },
        );
      }
      if (error.code === "invalid_request") {
        return json({ ok: false, code: "invalid_request" }, 400);
      }
      if (error.code === "not_configured") {
        return json({ ok: false, code: "assistant_not_configured" }, 503);
      }
    }
    return json({ ok: false, code: "assistant_unavailable" }, 503);
  }
}
