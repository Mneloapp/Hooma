export type StorefrontAssistantLanguage = "ka" | "en";
export type StorefrontAssistantRole = "user" | "assistant";
export type StorefrontAssistantSource = "knowledge" | "ai";

export type StorefrontAssistantAction =
  | "shop"
  | "custom_order"
  | "orders"
  | "hooma_plus"
  | "how_it_works"
  | "faq"
  | "privacy"
  | "terms";

export type StorefrontAssistantMessage = {
  role: StorefrontAssistantRole;
  content: string;
};

export type StorefrontAssistantProduct = {
  slug: string;
  nameKa: string;
  nameEn: string;
  categoryKa: string;
  categoryEn: string;
  startingPrice: number | null;
  leadTimeDays: number;
};

export type StorefrontAssistantReply = {
  answer: string;
  actions: StorefrontAssistantAction[];
  suggestions: string[];
  products: StorefrontAssistantProduct[];
  source: StorefrontAssistantSource;
};

export type StorefrontAssistantRequest = {
  language: StorefrontAssistantLanguage;
  currentPath: string;
  messages: StorefrontAssistantMessage[];
};
