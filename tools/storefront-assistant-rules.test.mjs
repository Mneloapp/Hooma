import assert from "node:assert/strict";
import test from "node:test";
import {
  getDirectStorefrontAnswer,
  shouldUseProductContextForQuestion,
} from "../lib/storefront-assistant/knowledge.ts";
import { containsSensitiveData } from "../lib/storefront-assistant/privacy.ts";

test("returns and damage outrank delivery and payment keywords", () => {
  const damaged = getDirectStorefrontAnswer(
    "მიწოდებული ნივთი დაზიანებულია, როგორ დავაბრუნო?",
    "ka",
  );
  const refund = getDirectStorefrontAnswer(
    "გადახდილი თანხა როდის დამიბრუნდება?",
    "ka",
  );

  assert.match(damaged?.answer ?? "", /შეკვეთის მონაცემები ამ ჩატში არ გამოგზავნო/);
  assert.match(refund?.answer ?? "", /უსაფრთხო პრეტენზიის/);
});

test("product discovery is not swallowed by broad FAQ words", () => {
  assert.equal(getDirectStorefrontAnswer("ბარათის დამჭერი გაქვთ?", "ka"), null);
  assert.equal(getDirectStorefrontAnswer("PETG კაუჭი მინდა", "ka"), null);
  assert.equal(
    getDirectStorefrontAnswer("მაჩვენე შავი ფერის ტელეფონის სადგამები", "ka"),
    null,
  );
  assert.equal(getDirectStorefrontAnswer("customer service", "en"), null);
});

test("known operational questions remain deterministic", () => {
  assert.match(
    getDirectStorefrontAnswer("როგორ შევუკვეთო?", "ka")?.answer ?? "",
    /BOG-ის უსაფრთხო გვერდზე/,
  );
  assert.match(
    getDirectStorefrontAnswer("When will I receive my order?", "en")?.answer ?? "",
    /prepare or dispatch/,
  );
  const membership = getDirectStorefrontAnswer("რა არის Hooma+?", "ka");
  assert.match(membership?.answer ?? "", /35₾/);
  assert.deepEqual(membership?.actions, ["hooma_plus"]);
});

test("product pages use authoritative product context for variable details", () => {
  assert.equal(
    shouldUseProductContextForQuestion("/product/example", "ეს რამდენ დღეში მოვა?"),
    true,
  );
  assert.equal(
    shouldUseProductContextForQuestion("/product/example", "რა ფერები აქვს?"),
    true,
  );
  assert.equal(
    shouldUseProductContextForQuestion("/shop", "როდის მივიღებ შეკვეთას?"),
    false,
  );
});

test("sensitive-data checks cover Georgian formats without treating a barcode as a card", () => {
  assert.equal(containsSensitiveData("ჩემი პაროლია abc123"), true);
  assert.equal(containsSensitiveData("+995 (555) 123-456"), true);
  assert.equal(containsSensitiveData("4111 1111 1111 1111"), true);
  assert.equal(containsSensitiveData("name@example.com"), true);
  assert.equal(containsSensitiveData("SKU 1234567890123"), false);
});
