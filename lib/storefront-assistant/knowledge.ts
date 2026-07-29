import type {
  StorefrontAssistantAction,
  StorefrontAssistantLanguage,
  StorefrontAssistantReply,
} from "./types";

type LocalizedCopy = {
  ka: string;
  en: string;
};

export type StorefrontFaq = {
  id: string;
  question: LocalizedCopy;
  answer: LocalizedCopy;
};

export const storefrontFaqs: StorefrontFaq[] = [
  {
    id: "how-to-order",
    question: {
      ka: "როგორ შევუკვეთო?",
      en: "How do I place an order?",
    },
    answer: {
      ka: "კატალოგში აირჩიე პროდუქტი, მიუთითე ვერსია, მასალა, ფერი და რაოდენობა, დაამატე კალათაში და გააგრძელე შეკვეთის გაფორმება. სრული თანხა გადაიხდება BOG-ის უსაფრთხო გვერდზე. მხოლოდ ბანკის დაცული დადასტურების შემდეგ მოინიშნება შეკვეთა გადახდილად, ხოლო წარმოებას ოპერატორი ამოწმებს. მიმდინარე სტატუსს „შეკვეთების“ გვერდზე ნახავ.",
      en: "Choose a product, select its version, material, color, and quantity, add it to the cart, and continue to checkout. The full amount is paid on BOG’s secure page. The order is marked paid only after the bank’s secure confirmation, and an operator reviews it before production. Follow the current status on the Orders page.",
    },
  },
  {
    id: "delivery",
    question: {
      ka: "როდის მივიღებ შეკვეთას?",
      en: "When will I receive my order?",
    },
    answer: {
      ka: "სტანდარტული კატალოგის პროდუქტებისთვის მიზანია, შეკვეთა 3 სამუშაო დღეში მომზადდეს ან გასაგზავნად გადაეცეს. ეს არ არის სახლში მიღების უპირობო გარანტია: ინდივიდუალური, რთული ან დიდი მოცულობის შეკვეთის რეალურ ვადას ოპერატორი დადასტურებისას გაცნობებს.",
      en: "For standard catalog products, the target is to prepare or dispatch the order within 3 business days. This is not an unconditional arrival guarantee; an operator confirms the actual timing for custom, complex, or high-volume orders.",
    },
  },
  {
    id: "made-to-order",
    question: {
      ka: "ყველა პროდუქტი წინასწარ მზად არის?",
      en: "Are all products kept in stock?",
    },
    answer: {
      ka: "არა. პროდუქტების უმეტესობა მზადდება შეკვეთის შემდეგ. ამიტომ ხელმისაწვდომობა ნიშნავს, რომ პროდუქტის შეკვეთა და დამზადება შესაძლებელია — არა იმას, რომ მზა ერთეული უკვე საწყობშია.",
      en: "No. Most products are made after you order. Availability means the item can be ordered and produced, not that a finished unit is already waiting in stock.",
    },
  },
  {
    id: "catalog-preview",
    question: {
      ka: "რას ნიშნავს კატალოგის პრევიუ?",
      en: "What does catalog preview mean?",
    },
    answer: {
      ka: "სატესტო ეტაპზე Hooma ამოწმებს პროდუქტის მონაცემებსა და შეკვეთის პროცესს. რეალური პროდუქტი საჯაროდ მხოლოდ ფასის, მედიის, წარმოების პროფილისა და გამოყენების უფლების ოპერატორის მიერ დადასტურების შემდეგ ქვეყნდება.",
      en: "During testing, Hooma validates product data and the ordering flow. A real product is published publicly only after an operator approves its price, media, production profile, and usage rights.",
    },
  },
  {
    id: "colors-materials",
    question: {
      ka: "როგორ ავირჩიო ფერი და მასალა?",
      en: "How do I choose a color and material?",
    },
    answer: {
      ka: "პროდუქტის გვერდზე ჩანს კონკრეტულად მისთვის ხელმისაწვდომი ფერები, მასალები და ვერსიები. თუ სასურველი ვარიანტი ჩამონათვალში არ არის, ინდივიდუალური შეკვეთა გამოგზავნე — სპეციალურ ვარიანტს ოპერატორი შეაფასებს.",
      en: "Each product page shows the colors, materials, and versions available for that item. If the option you need is not listed, submit a custom request and an operator will review it.",
    },
  },
  {
    id: "custom-order",
    question: {
      ka: "შემიძლია ინდივიდუალური ნივთის შეკვეთა?",
      en: "Can I request a custom item?",
    },
    answer: {
      ka: "დიახ. ინდივიდუალური შეკვეთის გვერდზე ატვირთე ფოტო ან ფაილი და მიუთითე ზომები, გამოყენების ადგილი და სასურველი მასალა. ოპერატორი შეაფასებს მოდელირების, უსაფრთხოებისა და დამზადების შესაძლებლობას და შემდეგ დაგიდასტურებს ფასსა და ვადას.",
      en: "Yes. On the custom-order page, upload a photo or file and provide dimensions, intended use, and preferred material. An operator will review modeling, safety, and production feasibility, then confirm the price and timing.",
    },
  },
  {
    id: "tracking",
    question: {
      ka: "სად ვნახო ჩემი შეკვეთის სტატუსი?",
      en: "Where can I see my order status?",
    },
    answer: {
      ka: "შედი ანგარიშში და გახსენი „შეკვეთები“. იქ ნახავ მომხმარებლისთვის განკუთვნილ მიმდინარე სტატუსს. უსაფრთხოების გამო Hooma ასისტენტი პირად შეკვეთას ჩატში არ ხსნის და სტატუსს მხოლოდ შეკვეთების გვერდი ადასტურებს.",
      en: "Sign in and open Orders to see the current customer-facing status. For security, the Hooma assistant does not open personal orders in chat; only the Orders page confirms their status.",
    },
  },
  {
    id: "payment",
    question: {
      ka: "ონლაინ გადახდა მუშაობს?",
      en: "Is online payment available?",
    },
    answer: {
      ka: "Hooma იყენებს BOG-ის უსაფრთხო გვერდზე სრულ გადახდას. განვადება და თანხის გაყოფა არ გამოიყენება. თუ checkout-ზე გადახდა დროებით მიუწვდომლად ჩანს, საბანკო კავშირი ჯერ არ არის გააქტიურებული და თანხა არ ჩამოგეჭრება.",
      en: "Hooma uses full payment on BOG’s secure page. Installments and split payments are not used. If checkout shows payment as temporarily unavailable, the bank connection is not active yet and you will not be charged.",
    },
  },
  {
    id: "returns",
    question: {
      ka: "რა ხდება, თუ ნივთი დაზიანებული ან შეკვეთისგან განსხვავებულია?",
      en: "What if an item is damaged or does not match my order?",
    },
    answer: {
      ka: "ხარვეზის, დაზიანების ან შეკვეთასთან შეუსაბამობის შემთხვევაში შედი ანგარიშში და გახსენი შესაბამისი შეკვეთა. შეკვეთის მონაცემები ამ ჩატში არ გამოგზავნო. შემთხვევა პროდუქტის ტიპისა და მოქმედი სამომხმარებლო წესების შესაბამისად განიხილება; უსაფრთხო პრეტენზიის გაგზავნის არხი ჯერ არ არის ჩართული.",
      en: "If an item is defective, damaged, or does not match the order, sign in and open the relevant order. Do not send order details in this chat. The case is reviewed according to the product type and applicable consumer rules; a secure claim-submission channel is not enabled yet.",
    },
  },
];

type KnowledgeRule = {
  faqId: StorefrontFaq["id"];
  keywords: string[];
  actions: StorefrontAssistantAction[];
  suggestions: LocalizedCopy[];
};

const rules: KnowledgeRule[] = [
  {
    faqId: "how-to-order",
    keywords: [
      "როგორ შევუკვეთო", "შეკვეთა როგორ", "როგორ ვიყიდო", "place an order", "how to order",
      "how do i order", "how can i order",
    ],
    actions: ["shop", "how_it_works"],
    suggestions: [
      { ka: "რამდენ დღეში მივიღებ?", en: "How soon will I receive it?" },
      { ka: "ინდივიდუალური ნივთი მინდა", en: "I want a custom item" },
    ],
  },
  {
    faqId: "tracking",
    keywords: [
      "შეკვეთის სტატუს", "სად არის ჩემი შეკვეთა", "ტრეკინგ", "tracking", "track my order",
      "order status", "where is my order",
    ],
    actions: ["orders"],
    suggestions: [
      { ka: "როგორ მუშაობს მიწოდება?", en: "How does delivery work?" },
      { ka: "ინდივიდუალური ნივთი მინდა", en: "I want a custom item" },
    ],
  },
  {
    faqId: "catalog-preview",
    keywords: [
      "კატალოგის პრევიუ", "სატესტო რეჟიმ", "catalog preview", "test mode",
    ],
    actions: ["how_it_works", "shop"],
    suggestions: [
      { ka: "როგორ შევუკვეთო?", en: "How do I place an order?" },
      { ka: "ონლაინ გადახდა მუშაობს?", en: "Is online payment available?" },
    ],
  },
  {
    faqId: "custom-order",
    keywords: [
      "ინდივიდუალური ნივთ", "ინდივიდუალური დეტალ", "ინდივიდუალური შეკვეთ", "ჩემი დიზაინ",
      "ჩემი ფაილ", "ატვირთ", "custom item", "custom order", "custom part", "custom design",
      "my design", "my file",
    ],
    actions: ["custom_order"],
    suggestions: [
      { ka: "რა ინფორმაცია უნდა გავაგზავნო?", en: "What information should I send?" },
      { ka: "როგორ ავირჩიო მასალა?", en: "How do I choose a material?" },
    ],
  },
  {
    faqId: "payment",
    keywords: [
      "გადახდ", "ბარათით გადახდ", "payment", "pay online", "pay by card",
      "credit card payment", "bank card payment",
    ],
    actions: ["how_it_works"],
    suggestions: [
      { ka: "როგორ შევუკვეთო?", en: "How do I place an order?" },
      { ka: "სად ვნახო შეკვეთის სტატუსი?", en: "Where can I see order status?" },
    ],
  },
  {
    faqId: "delivery",
    keywords: [
      "მიწოდ", "რამდენ დღ", "როდის მივიღ", "კურიერ", "delivery", "how many days", "when will",
      "courier", "shipping",
    ],
    actions: ["how_it_works"],
    suggestions: [
      { ka: "როგორ შევუკვეთო?", en: "How do I place an order?" },
      { ka: "ყველა პროდუქტი მზად გაქვთ?", en: "Are products kept in stock?" },
    ],
  },
  {
    faqId: "colors-materials",
    keywords: [
      "ფერი", "ფერები", "მასალა", "pla", "petg", "color", "colour", "material",
    ],
    actions: ["shop", "custom_order"],
    suggestions: [
      { ka: "ინდივიდუალური ფერი შეიძლება?", en: "Can I request a custom color?" },
      { ka: "პროდუქტები მაჩვენე", en: "Show me products" },
    ],
  },
  {
    faqId: "returns",
    keywords: [
      "დაბრუნ", "დამიბრუნ", "დაზიან", "ხარვეზ", "არ ემთხვევ", "refund", "return an item",
      "return this", "return it", "return policy", "returns policy", "damaged", "defect",
    ],
    actions: ["orders", "terms"],
    suggestions: [
      { ka: "სად ვნახო ჩემი შეკვეთა?", en: "Where can I see my order?" },
      { ka: "გამოყენების პირობები", en: "Terms of use" },
    ],
  },
  {
    faqId: "made-to-order",
    keywords: [
      "მარაგ", "საწყობ", "მზად გაქვ", "ხელმისაწვდომ", "stock", "in stock", "available",
    ],
    actions: ["shop", "how_it_works"],
    suggestions: [
      { ka: "რამდენ დღეში მივიღებ?", en: "How soon will I receive it?" },
      { ka: "როგორ ავირჩიო ფერი?", en: "How do I choose a color?" },
    ],
  },
];

export const storefrontAssistantStarters: Record<StorefrontAssistantLanguage, string[]> = {
  ka: [
    "როდის მივიღებ შეკვეთას?",
    "როგორ ავირჩიო ფერი და მასალა?",
    "ინდივიდუალური ნივთი მინდა",
    "სად არის ჩემი შეკვეთა?",
  ],
  en: [
    "When will I receive my order?",
    "How do I choose a color and material?",
    "I want a custom item",
    "Where is my order?",
  ],
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ka-GE").replace(/\s+/g, " ").trim();
}

export function shouldUseProductContextForQuestion(currentPath: string, message: string) {
  return /^\/(?:product|products|deals)\/[^/]+$/.test(currentPath)
    && /(?:ფერ|მასალ|ზომ|რამდენ დღ|როდის|მიწოდ|color|colour|material|dimension|size|when|delivery|shipping)/i.test(message);
}

export function getDirectStorefrontAnswer(
  message: string,
  language: StorefrontAssistantLanguage,
): StorefrontAssistantReply | null {
  const normalized = normalize(message);
  const matches = (candidate: KnowledgeRule) =>
    candidate.keywords.some((keyword) => normalized.includes(keyword));
  const returnsRule = rules.find((candidate) => candidate.faqId === "returns");
  const explicitCustomRequest = /(?:ინდივიდუალური (?:ნივთ|დეტალ|შეკვეთ)|ჩემი (?:დიზაინ|ფაილ)|custom (?:item|order|part|design)|my (?:design|file))/.test(normalized);
  const inventoryQuestion = /(?:ყველა პროდუქტი|წინასწარ მზად|მარაგში|საწყობში|in stock|kept in stock)/.test(normalized);
  const productDiscovery = /(?:მაჩვენ|მომიძებნ|მინდა(?:[?!., ]|$)|გაქვთ(?:[?!., ]|$)|იყიდება|show me|find me|looking for|do you (?:sell|have)|i (?:want|need))/.test(normalized);
  const rule = returnsRule && matches(returnsRule)
    ? returnsRule
    : productDiscovery && !explicitCustomRequest && !inventoryQuestion
      ? null
      : rules.find(matches);
  if (!rule) return null;

  const faq = storefrontFaqs.find((candidate) => candidate.id === rule.faqId);
  if (!faq) return null;

  return {
    answer: faq.answer[language],
    actions: rule.actions,
    suggestions: rule.suggestions.map((suggestion) => suggestion[language]),
    products: [],
    source: "knowledge",
  };
}
