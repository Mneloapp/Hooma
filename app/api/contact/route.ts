import { NextResponse } from "next/server";
import {
  contactRequestBodyTooLarge,
  ContactSupportError,
  isSameOriginContactRequest,
  readContactSubmission,
  submitContactRequest,
} from "@/lib/contact/server";
import { contactReference } from "@/lib/contact/core";

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

export async function POST(request: Request) {
  if (!isSameOriginContactRequest(request)) {
    return json({ ok: false, code: "forbidden" }, 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, code: "invalid_content_type" }, 415);
  }
  if (contactRequestBodyTooLarge(request)) {
    return json({ ok: false, code: "request_too_large" }, 413);
  }

  let submission;
  try {
    submission = await readContactSubmission(request);
  } catch (error) {
    if (error instanceof ContactSupportError && error.code === "request_too_large") {
      return json({ ok: false, code: "request_too_large" }, 413);
    }
    return json({ ok: false, code: "invalid_request" }, 400);
  }

  // Quietly accept the honeypot without storing data or sending email.
  if (submission.honeypotFilled) {
    return json({ ok: true, reference: contactReference(submission.submissionId) });
  }

  try {
    const result = await submitContactRequest(request, submission);
    return json({ ok: true, reference: result.reference });
  } catch (error) {
    if (error instanceof ContactSupportError) {
      if (error.code === "rate_limited") {
        return json(
          { ok: false, code: "rate_limited" },
          429,
          { "Retry-After": String(error.retryAfterSeconds ?? 600) },
        );
      }
      if (error.code === "delivery_in_progress") {
        return json(
          { ok: false, code: "delivery_in_progress" },
          409,
          { "Retry-After": String(error.retryAfterSeconds ?? 15) },
        );
      }
      if (error.code === "not_configured") {
        return json({ ok: false, code: "contact_not_configured" }, 503);
      }
    }
    return json({ ok: false, code: "contact_unavailable" }, 503);
  }
}
