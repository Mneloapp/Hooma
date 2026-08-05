import type {
  StorefrontAssistantAction,
  StorefrontAssistantLanguage,
  StorefrontAssistantReply,
} from "./types";

export const PRODUCT_SUPPLY_POLICY = {
  title: {
    ka: "კომპლექტაციის მნიშვნელოვანი წესი",
    en: "Important package-contents notice",
  },
  question: {
    ka: "რა შედის პროდუქტის კომპლექტაციაში?",
    en: "What is included with a product?",
  },
  body: {
    ka: "Hooma-ს შეკვეთაში შედის მხოლოდ პროდუქტის 3D პრინტერზე დაბეჭდილი ნაწილი ან ნაწილები. ფოტოებზე ნაჩვენები ლითონის რგოლები, საყურეს სამაგრები, ხრახნები, ძრავები, ელექტრონიკა და სხვა დამხმარე ან არადაბეჭდვადი კომპონენტები შეკვეთაში არ შედის. თუ პროდუქტის დასასრულებლად ასეთი დეტალი ან აწყობაა საჭირო, მომხმარებელი მას ცალკე იძენს და პროდუქტს თავად აწყობს.",
    en: "A Hooma order includes only the product part or parts made with a 3D printer. Metal rings, earring hooks, screws, motors, electronics, and any other supporting or non-printed components shown in photos are not included. If the product requires such a component or assembly to be completed, the customer obtains it separately and assembles the product.",
  },
} as const;

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
      ka: "სტანდარტული კატალოგის პროდუქტებისთვის მიზანია, შეკვეთა 3 სამუშაო დღეში მომზადდეს ან გასაგზავნად გადაეცეს. მიწოდება უფასოა აქტიური Hooma+ წევრისთვის, ახალი მომხმარებლის პირველ 10 პროდუქტის ერთეულზე (თუ მთელი კალათა დარჩენილ ბალანსში ეტევა) ან როცა პროდუქტის ჯამი მინიმუმ 100₾-ია. სხვა შემთხვევაში ერთ შეკვეთაზე მიწოდება 5₾ ღირს. საბოლოო პირობას Checkout აჩვენებს.",
      en: "For standard catalog products, the target is to prepare or dispatch the order within 3 business days. Delivery is free with active Hooma+, within a new customer's first 10 product units when the whole cart fits the remaining balance, or when the product subtotal is at least ₾100. Otherwise delivery is ₾5 per order. Checkout shows the final condition.",
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
    id: "product-supply-scope",
    question: PRODUCT_SUPPLY_POLICY.question,
    answer: PRODUCT_SUPPLY_POLICY.body,
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
    id: "order-cancellation",
    question: {
      ka: "შემიძლია გადახდილი შეკვეთის გაუქმება?",
      en: "Can I cancel a paid order?",
    },
    answer: {
      ka: "BOG-ით სრულად გადახდილი სტანდარტული კატალოგის შეკვეთა შეგიძლია გააუქმო ანგარიშის „შეკვეთების“ გვერდიდან მხოლოდ წარმოების დაწყებამდე, როცა შესაბამის შეკვეთაზე გაუქმების ღილაკი ჩანს. გაუქმება შეუქცევადია და სრული ჯამი, მიწოდების საფასურის ჩათვლით, გადახდის თავდაპირველ მეთოდზე დაბრუნდება; ბანკის მიერ ასახვის დრო შეიძლება განსხვავდებოდეს. წარმოების რიგში გადასვლის ან წარმოების დაწყების შემდეგ ავტომატური გაუქმება აღარ არის შესაძლებელი — დაუკავშირდი მხარდაჭერას. ჩატი პირადი შეკვეთის უფლებამოსილებას ან დაბრუნების სტატუსს ვერ ამოწმებს.",
      en: "You can cancel a standard catalog order paid in full through BOG from your account’s Orders page only before production starts and while the cancellation button is shown for that order. Cancellation is irreversible, and the full total, including the delivery fee, is returned to the original payment method; the bank’s posting time may vary. Automatic cancellation is unavailable once the order enters the production queue or production starts—contact support for assistance. Chat cannot verify a personal order’s eligibility or refund status.",
    },
  },
  {
    id: "hooma-plus",
    question: {
      ka: "რა არის Hooma+?",
      en: "What is Hooma+?",
    },
    answer: {
      ka: "Hooma+ არის კატალოგის სტანდარტული მიწოდების წინასწარ გადახდილი წევრობა: 35₾ ერთი კალენდარული თვით ან 350₾ ერთი კალენდარული წლით. წევრობა ავტომატურად არ განახლდება და განმეორებითი თანხა არ ჩამოიჭრება. მხოლოდ BOG-ის დაცული დადასტურების შემდეგ აქტიურდება. პირადი სტატუსი და პირველი 10 ერთეულის ბალანსი ჩანს ანგარიშის Hooma+ გვერდზე, ჩატს მათზე წვდომა არ აქვს.",
      en: "Hooma+ is prepaid membership for standard catalog delivery: ₾35 for one calendar month or ₾350 for one calendar year. It does not auto-renew or charge again automatically and activates only after BOG's secure confirmation. Your personal status and first-10-unit balance appear on the account Hooma+ page; chat cannot access them.",
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
    faqId: "product-supply-scope",
    keywords: [
      "რა შედის კომპლექტ", "რა შედის პროდუქტ", "რა მოყვება", "ყველა დეტალი მოყვება",
      "დამატებითი კომპონენტ", "დამხმარე დეტალ", "რგოლი მოყვება", "სამაგრი მოყვება",
      "ხრახნები მოყვება", "ძრავა მოყვება", "ელექტრონიკა მოყვება", "აწყობა სჭირდება",
      "what is included", "included in the box", "what comes with", "all parts included",
      "accessories included", "extra components", "ring included", "hook included",
      "screws included", "motor included", "electronics included", "assembly required",
    ],
    actions: ["faq", "shop"],
    suggestions: [
      { ka: "როგორ შევუკვეთო?", en: "How do I place an order?" },
      { ka: "ინდივიდუალური დეტალი მინდა", en: "I want a custom part" },
    ],
  },
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
    faqId: "order-cancellation",
    keywords: [
      "შეკვეთის გაუქმ", "შეკვეთა გავაუქმ", "გავაუქმო შეკვეთა", "გადახდილი შეკვეთა გავაუქმ", "გაუქმების ღილაკ",
      "cancel my order", "cancel an order", "cancel a paid order", "order cancellation",
    ],
    actions: ["orders", "terms"],
    suggestions: [
      { ka: "სად ვნახო ჩემი შეკვეთა?", en: "Where can I see my order?" },
      { ka: "გამოყენების პირობები", en: "Terms of use" },
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
    faqId: "hooma-plus",
    keywords: [
      "hooma+", "hooma plus", "უფასო მიწოდება", "წევრობა", "აბონემენტი",
      "membership", "free delivery", "monthly plan", "annual plan",
    ],
    actions: ["hooma_plus"],
    suggestions: [
      { ka: "როგორ ითვლება პირველი 10 ერთეული?", en: "How are the first 10 units counted?" },
      { ka: "რა ღირს სტანდარტული მიწოდება?", en: "What does standard delivery cost?" },
    ],
  },
  {
    faqId: "payment",
    keywords: [
      "გადახდ", "ბარათით გადახდ", "payment", "pay online", "pay by card",
      "credit card payment", "bank card payment",
    ],
    actions: ["how_it_works", "hooma_plus"],
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
    actions: ["how_it_works", "hooma_plus"],
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
  const cancellationRule = rules.find((candidate) => candidate.faqId === "order-cancellation");
  const explicitCancellation = /(?:შეკვეთ\S*.{0,32}(?:გაუქმ|გავაუქმ)|(?:გაუქმ|გავაუქმ)\S*.{0,32}შეკვეთ|გადახდილ\S*.{0,32}შეკვეთ\S*.{0,32}(?:გაუქმ|გავაუქმ)|cancel (?:my |an? |the )?(?:paid )?order|order cancellation)/.test(normalized);
  const explicitCustomRequest = /(?:ინდივიდუალური (?:ნივთ|დეტალ|შეკვეთ)|ჩემი (?:დიზაინ|ფაილ)|custom (?:item|order|part|design)|my (?:design|file))/.test(normalized);
  const inventoryQuestion = /(?:ყველა პროდუქტი|წინასწარ მზად|მარაგში|საწყობში|in stock|kept in stock)/.test(normalized);
  const productDiscovery = /(?:მაჩვენ|მომიძებნ|მინდა(?:[?!., ]|$)|გაქვთ(?:[?!., ]|$)|იყიდება|show me|find me|looking for|do you (?:sell|have)|i (?:want|need))/.test(normalized);
  const rule = explicitCancellation && cancellationRule
    ? cancellationRule
    : returnsRule && matches(returnsRule)
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
