import "server-only";

import { createHash, createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildContactEmail,
  CONTACT_REQUEST_MAX_BYTES,
  type ContactSubmission,
  parseContactSubmission,
} from "./core";

const resendEndpoint = "https://api.resend.com/emails";
const supportRecipient = "support@hooma.ge";
const providerTimeoutMs = 10_000;
const maximumProviderResponseBytes = 32 * 1024;
const maximumDeliveryAttempts = 3;

export class ContactSupportError extends Error {
  readonly code:
    | "invalid_request"
    | "request_too_large"
    | "not_configured"
    | "rate_limited"
    | "delivery_in_progress"
    | "provider_unavailable";
  readonly retryAfterSeconds: number | null;

  constructor(code: ContactSupportError["code"], retryAfterSeconds: number | null = null) {
    super(code);
    this.name = "ContactSupportError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isContactSupportEnabled() {
  return process.env.HOOMA_CONTACT_ENABLED?.trim().toLowerCase() === "true";
}

export function contactRequestBodyTooLarge(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  return Number.isFinite(declaredLength) && declaredLength > CONTACT_REQUEST_MAX_BYTES;
}

export async function readContactSubmission(request: Request) {
  const body = await request.text();
  if (!body || Buffer.byteLength(body, "utf8") > CONTACT_REQUEST_MAX_BYTES) {
    throw new ContactSupportError("request_too_large");
  }
  try {
    return parseContactSubmission(JSON.parse(body));
  } catch (error) {
    if (error instanceof ContactSupportError) throw error;
    throw new ContactSupportError("invalid_request");
  }
}

export function isSameOriginContactRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin) return process.env.NODE_ENV !== "production";
  if (fetchSite && !["same-origin", "same-site"].includes(fetchSite)) return false;

  try {
    const requestUrl = new URL(request.url);
    const expectedHost = (
      request.headers.get("x-forwarded-host")
      ?? request.headers.get("host")
      ?? requestUrl.host
    ).split(",")[0].trim();
    const expectedProtocol = `${(
      request.headers.get("x-forwarded-proto")
      ?? requestUrl.protocol.replace(":", "")
    ).split(",")[0].trim()}:`;
    const originUrl = new URL(origin);
    return originUrl.host === expectedHost && originUrl.protocol === expectedProtocol;
  } catch {
    return false;
  }
}

function getRateLimitSecret() {
  return process.env.HOOMA_CONTACT_RATE_LIMIT_SECRET?.trim()
    || process.env.RESEND_API_KEY?.trim()
    || process.env.SUPABASE_SECRET_KEY?.trim()
    || null;
}

function hmacFingerprint(secret: string, namespace: string, value: string) {
  return createHmac("sha256", secret).update(`${namespace}\0${value}`).digest("hex");
}

function requestClientFingerprint(request: Request, secret: string) {
  const forwardedFor = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? "unknown";
  const ip = forwardedFor.split(",")[0]?.trim().slice(0, 120) || "unknown";
  return hmacFingerprint(secret, "contact-ip-v1", ip);
}

function submissionPayloadHash(submission: ContactSubmission) {
  return createHash("sha256").update(JSON.stringify({
    id: submission.submissionId,
    language: submission.language,
    topic: submission.topic,
    name: submission.name,
    email: submission.email,
    phone: submission.phone,
    orderReference: submission.orderReference,
    subject: submission.subject,
    message: submission.message,
  })).digest("hex");
}

type Reservation = {
  terminal: boolean;
  shouldSend: boolean;
  emailAttempts: number;
  retryAfterSeconds: number | null;
};

async function reserveContactRequest(request: Request, submission: ContactSubmission): Promise<Reservation> {
  const secret = getRateLimitSecret();
  const admin = createAdminClient() as any;
  if (!secret || !admin) throw new ContactSupportError("not_configured");

  const clientKey = requestClientFingerprint(request, secret);
  const emailKey = hmacFingerprint(secret, "contact-email-v1", submission.email);
  const { data, error } = await admin.rpc("reserve_contact_request_v1", {
    requested_id: submission.submissionId,
    requested_client_key: clientKey,
    requested_email_key: emailKey,
    requested_payload_hash: submissionPayloadHash(submission),
    requested_name: submission.name,
    requested_email: submission.email,
    requested_phone: submission.phone,
    requested_topic: submission.topic,
    requested_subject: submission.subject,
    requested_order_reference: submission.orderReference,
    requested_message: submission.message,
    requested_language: submission.language,
  });
  if (error || !isRecord(data)) throw new ContactSupportError("provider_unavailable");
  if (data.allowed !== true) {
    const retryAfter = Number(data.retry_after_seconds);
    throw new ContactSupportError(
      "rate_limited",
      Number.isFinite(retryAfter) ? Math.max(1, Math.min(86_400, retryAfter)) : 600,
    );
  }

  const attempts = Number(data.email_attempts);
  const retryAfter = Number(data.retry_after_seconds);
  return {
    terminal: data.status === "email_sent" || data.status === "resolved",
    shouldSend: data.should_send === true,
    emailAttempts: Number.isFinite(attempts) ? Math.max(0, attempts) : 0,
    retryAfterSeconds: Number.isFinite(retryAfter)
      ? Math.max(1, Math.min(300, retryAfter))
      : null,
  };
}

function getEmailConfiguration() {
  if (!isContactSupportEnabled()) throw new ContactSupportError("not_configured");
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.HOOMA_CONTACT_FROM_EMAIL?.trim()
    || "Hooma Website <support@hooma.ge>";
  if (!apiKey || apiKey.length < 12 || !from || /[\r\n]/u.test(from) || from.length > 254) {
    throw new ContactSupportError("not_configured");
  }
  return { apiKey, from };
}

type DeliveryResult = {
  accepted: boolean;
  providerId: string | null;
  httpStatus: number | null;
  errorCode: string;
};

async function readBoundedProviderResponse(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumProviderResponseBytes) return null;
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let result = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > maximumProviderResponseBytes) {
        await reader.cancel();
        return null;
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function sendWithResend(submission: ContactSubmission): Promise<DeliveryResult> {
  const { apiKey, from } = getEmailConfiguration();
  const email = buildContactEmail(submission);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);

  try {
    const response = await fetch(resendEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `contact-request/${submission.submissionId}`,
      },
      body: JSON.stringify({
        from,
        to: [supportRecipient],
        reply_to: submission.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const responseBody = await readBoundedProviderResponse(response);
    if (responseBody === null) {
      return {
        accepted: false,
        providerId: null,
        httpStatus: response.status,
        errorCode: "provider_response_too_large",
      };
    }
    let payload: unknown = null;
    try {
      payload = responseBody ? JSON.parse(responseBody) : null;
    } catch {
      payload = null;
    }
    const providerId = isRecord(payload) && typeof payload.id === "string"
      ? payload.id.trim().slice(0, 200)
      : null;
    if (response.ok && providerId) {
      return { accepted: true, providerId, httpStatus: response.status, errorCode: "accepted" };
    }
    return {
      accepted: false,
      providerId: null,
      httpStatus: response.status,
      errorCode: response.ok ? "invalid_provider_response" : `provider_http_${response.status}`,
    };
  } catch (error) {
    return {
      accepted: false,
      providerId: null,
      httpStatus: null,
      errorCode: error instanceof Error && error.name === "AbortError"
        ? "provider_timeout"
        : "provider_network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordDeliveryResult(submissionId: string, result: DeliveryResult) {
  const admin = createAdminClient() as any;
  if (!admin) return false;
  const { error } = await admin.rpc("record_contact_email_result_v1", {
    requested_id: submissionId,
    requested_outcome: result.accepted ? "sent" : "failed",
    requested_provider_email_id: result.providerId,
    requested_provider_http_status: result.httpStatus,
    requested_error_code: result.errorCode,
  });
  return !error;
}

export async function submitContactRequest(request: Request, submission: ContactSubmission) {
  getEmailConfiguration();
  const reservation = await reserveContactRequest(request, submission);
  const email = buildContactEmail(submission);
  if (reservation.terminal) return { reference: email.reference };
  if (!reservation.shouldSend) {
    if (reservation.retryAfterSeconds) {
      throw new ContactSupportError("delivery_in_progress", reservation.retryAfterSeconds);
    }
    throw new ContactSupportError("provider_unavailable");
  }
  if (reservation.emailAttempts > maximumDeliveryAttempts) {
    throw new ContactSupportError("provider_unavailable");
  }

  const result = await sendWithResend(submission);
  const recorded = await recordDeliveryResult(submission.submissionId, result);
  if (!result.accepted) {
    console.error("CONTACT_EMAIL_DELIVERY_FAILED", {
      requestId: submission.submissionId,
      httpStatus: result.httpStatus,
      errorCode: result.errorCode,
      resultRecorded: recorded,
    });
    throw new ContactSupportError("provider_unavailable");
  }
  if (!recorded) {
    console.error("CONTACT_EMAIL_RESULT_RECORD_FAILED", { requestId: submission.submissionId });
  }
  return { reference: email.reference };
}
