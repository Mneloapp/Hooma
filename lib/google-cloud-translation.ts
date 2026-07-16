import "server-only";

const translationEndpoint = "https://translation.googleapis.com/language/translate/v2";
const providerName = "google-cloud-translation-basic-v2" as const;
const targetLanguage = "ka" as const;
const requestTimeoutMs = 15_000;
const maximumResponseLength = 64 * 1024;

type ProductCopyField = "name" | "description";

export type ProductCopyTranslationInput = {
  name?: string | null;
  description?: string | null;
};

export type GeorgianProductCopyTranslation = {
  provider: typeof providerName;
  targetLanguage: typeof targetLanguage;
  name: string | null;
  description: string | null;
  detectedSourceLanguages: {
    name: string | null;
    description: string | null;
  };
};

export type GoogleCloudTranslationErrorCode =
  | "invalid_input"
  | "not_configured"
  | "timeout"
  | "network_error"
  | "provider_rejected"
  | "invalid_response";

/**
 * Contains only a stable, non-sensitive error code and an optional HTTP status.
 * Provider response bodies and submitted product copy are deliberately excluded.
 */
export class GoogleCloudTranslationError extends Error {
  readonly code: GoogleCloudTranslationErrorCode;
  readonly status: number | null;

  constructor(code: GoogleCloudTranslationErrorCode, status: number | null = null) {
    super(errorMessage(code));
    this.name = "GoogleCloudTranslationError";
    this.code = code;
    this.status = status;
  }
}

function errorMessage(code: GoogleCloudTranslationErrorCode) {
  switch (code) {
    case "invalid_input":
      return "Product copy is not valid for translation.";
    case "not_configured":
      return "Product translation is not configured.";
    case "timeout":
      return "Product translation timed out.";
    case "network_error":
      return "Product translation service is unavailable.";
    case "provider_rejected":
      return "Product translation request was rejected.";
    case "invalid_response":
      return "Product translation returned an invalid response.";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanInput(value: string | null | undefined, maximumLength: number) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new GoogleCloudTranslationError("invalid_input");

  const clean = value.replace(/\u0000/g, "").trim();
  if (!clean) return null;
  if (clean.length > maximumLength) throw new GoogleCloudTranslationError("invalid_input");
  return clean;
}

function validCodePoint(codePoint: number) {
  return Number.isInteger(codePoint)
    && codePoint > 0
    && codePoint <= 0x10ffff
    && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
}

/** Decode only well-defined text entities without ever interpreting the result as HTML. */
function decodeTextEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(?:#([0-9]{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
      if (named) return namedEntities[named.toLowerCase()] ?? entity;
      const codePoint = Number.parseInt(decimal ?? hexadecimal ?? "", decimal ? 10 : 16);
      return validCodePoint(codePoint) ? String.fromCodePoint(codePoint) : entity;
    },
  );
}

function cleanTranslation(value: unknown, maximumLength: number) {
  if (typeof value !== "string") throw new GoogleCloudTranslationError("invalid_response");
  const clean = decodeTextEntities(value).replace(/\u0000/g, "").trim();
  if (!clean) throw new GoogleCloudTranslationError("invalid_response");
  if (clean.length <= maximumLength) return clean;

  const contentLimit = Math.max(1, maximumLength - 1);
  let candidate = "";
  for (const character of clean) {
    if (candidate.length + character.length > contentLimit) break;
    candidate += character;
  }
  const lastWhitespace = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("\n"), candidate.lastIndexOf("\t"));
  const safeBoundary = lastWhitespace >= Math.floor(contentLimit * 0.7) ? lastWhitespace : contentLimit;
  const truncated = candidate.slice(0, safeBoundary).trimEnd();
  if (!truncated) throw new GoogleCloudTranslationError("invalid_response");
  return `${truncated}…`;
}

function cleanDetectedLanguage(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) {
    throw new GoogleCloudTranslationError("invalid_response");
  }
  return value;
}

/**
 * Translates product name and description to Georgian with Google Cloud
 * Translation Basic v2. The API key is read only on the server and is sent in
 * an HTTP header so it never appears in a request URL.
 */
export async function translateProductCopyToGeorgian(
  input: ProductCopyTranslationInput,
): Promise<GeorgianProductCopyTranslation> {
  const source = {
    name: cleanInput(input.name, 160),
    description: cleanInput(input.description, 3_000),
  };
  const fields = (Object.keys(source) as ProductCopyField[]).filter((field) => source[field] !== null);
  if (!fields.length) throw new GoogleCloudTranslationError("invalid_input");

  const apiKey = process.env.GOOGLE_CLOUD_TRANSLATION_API_KEY?.trim();
  if (!apiKey) throw new GoogleCloudTranslationError("not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(translationEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        q: fields.map((field) => source[field]),
        target: targetLanguage,
        format: "text",
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GoogleCloudTranslationError("provider_rejected", response.status);
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumResponseLength) {
      throw new GoogleCloudTranslationError("invalid_response");
    }

    const responseText = await response.text();
    if (!responseText || responseText.length > maximumResponseLength) {
      throw new GoogleCloudTranslationError("invalid_response");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new GoogleCloudTranslationError("invalid_response");
    }

    if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.translations)) {
      throw new GoogleCloudTranslationError("invalid_response");
    }

    const translations = payload.data.translations;
    if (translations.length !== fields.length || translations.some((translation) => !isRecord(translation))) {
      throw new GoogleCloudTranslationError("invalid_response");
    }

    const result: GeorgianProductCopyTranslation = {
      provider: providerName,
      targetLanguage,
      name: null,
      description: null,
      detectedSourceLanguages: { name: null, description: null },
    };

    fields.forEach((field, index) => {
      const translation = translations[index] as Record<string, unknown>;
      const maximumLength = field === "name" ? 160 : 3_000;
      result[field] = cleanTranslation(translation.translatedText, maximumLength);
      result.detectedSourceLanguages[field] = cleanDetectedLanguage(translation.detectedSourceLanguage);
    });

    return result;
  } catch (error) {
    if (error instanceof GoogleCloudTranslationError) throw error;
    if (controller.signal.aborted) throw new GoogleCloudTranslationError("timeout");
    throw new GoogleCloudTranslationError("network_error");
  } finally {
    clearTimeout(timeout);
  }
}
