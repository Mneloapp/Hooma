export const CONTACT_REQUEST_MAX_BYTES = 16 * 1024;

export const contactTopics = [
  "order",
  "payment_refund",
  "delivery",
  "product_quality",
  "account_privacy",
  "hooma_plus",
  "partnership",
  "other",
] as const;

export type ContactTopic = (typeof contactTopics)[number];
export type ContactLanguage = "ka" | "en";

export type ContactSubmission = {
  submissionId: string;
  language: ContactLanguage;
  topic: ContactTopic;
  name: string;
  email: string;
  phone: string | null;
  orderReference: string | null;
  subject: string;
  message: string;
  honeypotFilled: boolean;
};

export const contactTopicLabels: Record<ContactTopic, { ka: string; en: string }> = {
  order: { ka: "შეკვეთა და სტატუსი", en: "Order and status" },
  payment_refund: { ka: "გადახდა ან თანხის დაბრუნება", en: "Payment or refund" },
  delivery: { ka: "მიწოდება", en: "Delivery" },
  product_quality: { ka: "პროდუქტი, ხარისხი ან დაზიანება", en: "Product, quality, or damage" },
  account_privacy: { ka: "ანგარიში და პერსონალური მონაცემები", en: "Account and personal data" },
  hooma_plus: { ka: "Hooma+", en: "Hooma+" },
  partnership: { ka: "პარტნიორობა / ბიზნეს შეთავაზება", en: "Partnership / business inquiry" },
  other: { ka: "სხვა საკითხი", en: "Other" },
};

export class ContactRequestError extends Error {
  readonly code: "invalid_request" | "request_too_large";

  constructor(code: ContactRequestError["code"]) {
    super(code);
    this.name = "ContactRequestError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSingleLine(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMessage(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function requiredSingleLine(value: unknown, minimum: number, maximum: number) {
  const normalized = normalizeSingleLine(value);
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ContactRequestError("invalid_request");
  }
  return normalized;
}

function optionalSingleLine(value: unknown, maximum: number) {
  const normalized = normalizeSingleLine(value);
  if (!normalized) return null;
  if (normalized.length > maximum) throw new ContactRequestError("invalid_request");
  return normalized;
}

function isValidEmail(value: string) {
  if (value.length > 254 || value.includes("..")) return false;
  return /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/u.test(value);
}

function passesLuhnCheck(digits: string) {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function containsProbablePaymentCardNumber(value: string) {
  const candidates = value.match(/(?:^|[^\d])((?:\d[ -]?){12,18}\d)(?!\d)/gu) ?? [];
  return candidates.some((candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && passesLuhnCheck(digits);
  });
}

export function parseContactSubmission(value: unknown): ContactSubmission {
  if (!isRecord(value)) throw new ContactRequestError("invalid_request");

  const submissionId = normalizeSingleLine(value.submissionId).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(submissionId)) {
    throw new ContactRequestError("invalid_request");
  }

  const language: ContactLanguage = value.language === "en" ? "en" : "ka";
  const topicValue = normalizeSingleLine(value.topic);
  if (!contactTopics.includes(topicValue as ContactTopic)) {
    throw new ContactRequestError("invalid_request");
  }

  const name = requiredSingleLine(value.name, 2, 100);
  const email = requiredSingleLine(value.email, 5, 254).toLowerCase();
  if (!isValidEmail(email)) throw new ContactRequestError("invalid_request");

  const phone = optionalSingleLine(value.phone, 30);
  const orderReference = optionalSingleLine(value.orderReference, 64);
  const subject = requiredSingleLine(value.subject, 3, 140);
  const message = normalizeMessage(value.message);
  if (message.length < 20 || message.length > 4_000) {
    throw new ContactRequestError("invalid_request");
  }
  if (containsProbablePaymentCardNumber([name, phone, subject, orderReference, message].filter(Boolean).join("\n"))) {
    throw new ContactRequestError("invalid_request");
  }

  return {
    submissionId,
    language,
    topic: topicValue as ContactTopic,
    name,
    email,
    phone,
    orderReference,
    subject,
    message,
    honeypotFilled: Boolean(normalizeSingleLine(value.website)),
  };
}

export function escapeContactHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlValue(value: string | null) {
  return escapeContactHtml(value || "—").replace(/\n/g, "<br />");
}

export function contactReference(submissionId: string) {
  return `HC-${submissionId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export function buildContactEmail(submission: ContactSubmission) {
  const reference = contactReference(submission.submissionId);
  const topic = contactTopicLabels[submission.topic];
  const topicLabel = `${topic.ka} / ${topic.en}`;
  const subject = `[${reference}] ${topic.ka} — ${submission.subject}`;
  const text = [
    `Hooma support request ${reference}`,
    "",
    `Topic: ${topicLabel}`,
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Phone: ${submission.phone || "—"}`,
    `Order / tracking reference: ${submission.orderReference || "—"}`,
    `Language: ${submission.language}`,
    `Subject: ${submission.subject}`,
    "",
    "Message:",
    submission.message,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#1f2933;line-height:1.6">
      <p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280">Hooma Support · ${reference}</p>
      <h1 style="font-size:24px;margin:8px 0 24px">${htmlValue(submission.subject)}</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 12px;background:#f5f3ee;font-weight:600">Topic</td><td style="padding:8px 12px">${htmlValue(topicLabel)}</td></tr>
        <tr><td style="padding:8px 12px;background:#f5f3ee;font-weight:600">Name</td><td style="padding:8px 12px">${htmlValue(submission.name)}</td></tr>
        <tr><td style="padding:8px 12px;background:#f5f3ee;font-weight:600">Email</td><td style="padding:8px 12px">${htmlValue(submission.email)}</td></tr>
        <tr><td style="padding:8px 12px;background:#f5f3ee;font-weight:600">Phone</td><td style="padding:8px 12px">${htmlValue(submission.phone)}</td></tr>
        <tr><td style="padding:8px 12px;background:#f5f3ee;font-weight:600">Order / tracking</td><td style="padding:8px 12px">${htmlValue(submission.orderReference)}</td></tr>
        <tr><td style="padding:8px 12px;background:#f5f3ee;font-weight:600">Language</td><td style="padding:8px 12px">${htmlValue(submission.language)}</td></tr>
      </table>
      <h2 style="font-size:16px;margin:28px 0 8px">Message</h2>
      <div style="padding:16px;border-radius:16px;background:#f8f7f4">${htmlValue(submission.message)}</div>
      <p style="margin-top:24px;font-size:12px;color:#6b7280">Reply to this email to answer the customer. Never request a password, CVV, one-time code, or full card number.</p>
    </div>
  `.trim();

  return { subject, text, html, reference };
}
