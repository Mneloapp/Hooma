import type {
  StorefrontAssistantLanguage,
  StorefrontAssistantReply,
} from "./types";

export function containsSensitiveData(message: string) {
  const possibleCard = (message.match(/(?<!\d)\d(?:[\s-]?\d){12,18}(?!\d)/g) ?? [])
    .some((candidate) => {
      const digits = candidate.replace(/\D/g, "");
      const knownCardShape = /^(?:4\d{12}(?:\d{3}){0,2}|(?:5[1-5]|2\d)\d{14}|3[47]\d{13}|6\d{15,18})$/.test(digits);
      if (!knownCardShape) return false;
      let sum = 0;
      let doubleDigit = false;
      for (let index = digits.length - 1; index >= 0; index -= 1) {
        let digit = Number(digits[index]);
        if (doubleDigit) {
          digit *= 2;
          if (digit > 9) digit -= 9;
        }
        sum += digit;
        doubleDigit = !doubleDigit;
      }
      return sum % 10 === 0;
    });
  const email = /[^\s@]+@[^\s@]+\.[^\s@]+/i.test(message);
  const georgianPhone = /(?<!\d)(?:\+?995[\s().-]*)?5(?:[\s().-]*\d){8}(?!\d)/.test(message);
  const secret = /\b(?:password|api[_ -]?key|secret[_ -]?key|sk-[a-z0-9_-]{8,})\b/i.test(message)
    || /პაროლ/u.test(message);
  return possibleCard || email || georgianPhone || secret;
}

export function sensitiveDataReply(language: StorefrontAssistantLanguage): StorefrontAssistantReply {
  return {
    answer: language === "ka"
      ? "უსაფრთხოებისთვის ჩატში ნუ გამოგზავნი პაროლს, საბანკო ბარათის მონაცემებს, ტელეფონს, ელფოსტას ან სხვა მგრძნობიარე ინფორმაციას. პირადი შეკვეთის სანახავად შედი საკუთარ ანგარიშში და გახსენი „შეკვეთები“."
      : "For your safety, do not send passwords, bank-card details, phone numbers, email addresses, or other sensitive information in chat. To view a personal order, sign in and open Orders.",
    actions: ["orders", "privacy"],
    suggestions: language === "ka"
      ? ["როგორ ვნახო შეკვეთის სტატუსი?", "კონფიდენციალურობის პოლიტიკა"]
      : ["How do I view order status?", "Privacy policy"],
    products: [],
    source: "knowledge",
  };
}
