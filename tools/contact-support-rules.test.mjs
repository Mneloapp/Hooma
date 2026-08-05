import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildContactEmail,
  ContactRequestError,
  containsProbablePaymentCardNumber,
  parseContactSubmission,
} from "../lib/contact/core.ts";
import { getDirectStorefrontAnswer } from "../lib/storefront-assistant/knowledge.ts";

const validInput = {
  submissionId: "9a4cba7a-c0d2-4b0f-9f92-6a1f6100bf35",
  language: "ka",
  topic: "order",
  name: "გიორგი დევდარიანი",
  email: "Customer@Example.com",
  phone: "+995 555 12 34 56",
  orderReference: "098DE374F0BB",
  subject: "შეკვეთის სტატუსი",
  message: "გთხოვთ შემატყობინოთ, რა ეტაპზეა ჩემი შეკვეთა.",
  website: "",
};

const [route, server, form, page, migration, privacy, assistantUi] = await Promise.all([
  readFile(new URL("../app/api/contact/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/contact/server.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/contact/ContactForm.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/contact/ContactSupportPage.tsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260805000300_contact_support_requests.sql", import.meta.url), "utf8"),
  readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/assistant/HoomaAssistant.tsx", import.meta.url), "utf8"),
]);

test("contact parser validates and normalizes the public request", () => {
  const parsed = parseContactSubmission(validInput);
  assert.equal(parsed.email, "customer@example.com");
  assert.equal(parsed.topic, "order");
  assert.equal(parsed.honeypotFilled, false);

  assert.throws(
    () => parseContactSubmission({ ...validInput, topic: "arbitrary-recipient" }),
    ContactRequestError,
  );
  assert.throws(
    () => parseContactSubmission({ ...validInput, email: "not-an-email" }),
    ContactRequestError,
  );
  assert.throws(
    () => parseContactSubmission({ ...validInput, message: "x".repeat(4_001) }),
    ContactRequestError,
  );
  assert.equal(containsProbablePaymentCardNumber("4111 1111 1111 1111"), true);
  assert.throws(
    () => parseContactSubmission({ ...validInput, message: "ჩემი ბარათია 4111 1111 1111 1111, დამეხმარეთ." }),
    ContactRequestError,
  );
  assert.throws(
    () => parseContactSubmission({ ...validInput, phone: "4111111111111111" }),
    ContactRequestError,
  );
});

test("contact email prevents header and HTML injection", () => {
  const parsed = parseContactSubmission({
    ...validInput,
    name: "Customer\r\nBcc: attacker@example.com",
    subject: "Help\r\nBcc: attacker@example.com",
    message: "Please review <script>alert('x')</script> safely.",
  });
  const email = buildContactEmail(parsed);

  assert.doesNotMatch(email.subject, /[\r\n]/);
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.text, /HC-9A4CBA7AC0D2/);
});

test("contact delivery is fixed, idempotent, bounded, and server-only", () => {
  assert.match(server, /const supportRecipient = "support@hooma\.ge"/);
  assert.match(server, /reply_to: submission\.email/);
  assert.match(server, /"Idempotency-Key": `contact-request\/\$\{submission\.submissionId\}`/);
  assert.match(server, /providerTimeoutMs = 10_000/);
  assert.doesNotMatch(server, /\n\s*to:\s*submission\./);
  assert.match(route, /isSameOriginContactRequest/);
  assert.match(route, /invalid_content_type/);
  assert.match(route, /submission\.honeypotFilled/);
  assert.match(form, /type="submit"/);
  assert.match(form, /disabled=\{!enabled \|\| busy\}/);
  assert.match(form, /logicalRequest\.current\?\.payload === serializedPayload/);
  assert.match(form, /fieldset disabled=\{!enabled \|\| busy\}/);
  assert.match(form, /role=\{status\.kind === "error" \? "alert" : "status"\}/);
});

test("contact requests are durable and protected by RLS and service-only RPCs", () => {
  assert.match(migration, /create table if not exists public\.contact_requests/);
  assert.match(migration, /alter table public\.contact_requests enable row level security/);
  assert.match(migration, /has_staff_role\(array\['owner', 'admin', 'support'\]\)/);
  assert.match(migration, /revoke all on public\.contact_requests from public, anon, authenticated/);
  assert.match(migration, /reserve_contact_request_v1/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /client_ten_minute_count >= 3/);
  assert.match(migration, /email_daily_count >= 5/);
  assert.match(migration, /status = 'email_sending'/);
  assert.match(migration, /'should_send', true/);
  assert.match(migration, /email_attempts = email_attempts \+ 1/);
  assert.doesNotMatch(migration, /set status = case[\s\S]{0,250}email_attempts = email_attempts \+ 1/);
  assert.doesNotMatch(migration, /user_agent|raw_ip/i);
});

test("contact page is general support and custom production remains separate", () => {
  assert.match(page, /როგორ შეგვიძლია დაგეხმაროთ/);
  assert.match(page, /support@hooma\.ge/);
  assert.match(page, /href="\/account\/custom-orders"/);
  assert.match(form, /name="order_reference"/);
  assert.match(form, /name="message"/);
  assert.match(form, /name="website"/);
  assert.match(privacy, /საკონტაქტო ფორმაში მითითებული საკითხი/);
});

test("FAQ and assistant point customers to the working support handoff", () => {
  const answer = getDirectStorefrontAnswer("როგორ დაგიკავშირდეთ?", "ka");
  assert.match(answer?.answer ?? "", /საკონტაქტო ფორმა/);
  assert.deepEqual(answer?.actions, ["contact"]);
  assert.match(assistantUi, /contact: "\/contact"/);
  assert.match(assistantUi, /მხარდაჭერასთან დაკავშირება/);
});
