import "server-only";

import { createHash } from "node:crypto";
import {
  providerConfig,
  TIKTOK_APPROVED_APP_ID,
  tiktokAppReviewReceiptSha256,
  tiktokOAuthConnectionReceiptSha256,
  tiktokOrganicActivationReceiptSha256,
} from "./config";
import type { TikTokPublishingConnection } from "./connections";
import {
  TIKTOK_ORGANIC_SCHEMA_ID,
  type TikTokOrganicActivation,
} from "./providers/tiktok-business-organic";
import { TIKTOK_MEDIA_PROXY_PREFIX } from "./tiktok-media-delivery";

type JsonObject = Record<string, unknown>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function requiredReceipt(value: string | null, name: string) {
  if (!value) throw new Error(`TIKTOK_ACTIVATION_RECEIPT_MISSING:${name}`);
  return value;
}

export function tiktokOrganicActivation(
  connection: TikTokPublishingConnection,
): TikTokOrganicActivation {
  const configured = providerConfig("tiktok");
  const mediaUrl = new URL(TIKTOK_MEDIA_PROXY_PREFIX);
  const mediaHost = mediaUrl.hostname.toLowerCase();
  return {
    schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
    apiVersion: "v1.3",
    appId: TIKTOK_APPROVED_APP_ID,
    appReviewStatus: "APPROVED",
    appReviewReceiptSha256: requiredReceipt(
      tiktokAppReviewReceiptSha256(),
      "APP_REVIEW",
    ),
    activationReceiptSha256: requiredReceipt(
      tiktokOrganicActivationReceiptSha256(),
      "ORGANIC_ACTIVATION",
    ),
    oauthConnectionStatus: "ACTIVE_VERIFIED",
    oauthConnectionReceiptSha256: requiredReceipt(
      tiktokOAuthConnectionReceiptSha256(),
      "OAUTH_CONNECTION",
    ),
    oauthConnectionVerifiedAt: connection.lastVerifiedAt,
    oauthAccessExpiresAt: connection.accessExpiresAt,
    oauthScopes: [...connection.scopes],
    endpointSchemaReceiptSha256: sha256({
      schema: TIKTOK_ORGANIC_SCHEMA_ID,
      apiVersion: "v1.3",
      endpoints: [
        "/business/video/list/",
        "/business/video/publish/",
        "/business/publish/status/",
      ],
      redirectPolicy: "ERROR",
    }),
    identityReceiptSha256: sha256({
      provider: "tiktok",
      appId: configured.clientId,
      accountIdSha256: createHash("sha256")
        .update(connection.externalAccountId, "utf8")
        .digest("hex"),
      username: connection.username,
      lastVerifiedAt: connection.lastVerifiedAt,
    }),
    oauthScopeReceiptSha256: sha256({
      provider: "tiktok",
      appId: configured.clientId,
      scopes: [...connection.scopes].sort(),
    }),
    urlPropertyReceiptSha256: sha256({
      provider: "tiktok",
      origin: mediaUrl.origin,
      prefix: TIKTOK_MEDIA_PROXY_PREFIX,
      host: mediaHost,
      sourceBucketVisibility: "PRIVATE_SIGNED_URL_ONLY",
      deliveryMode: "SAME_ORIGIN_STREAMING_PROXY",
      minimumTtlSeconds: 1_800,
    }),
    cmlSchemaReceiptSha256: sha256({
      provider: "tiktok",
      acceptedMusicModes: ["HOOMA_OWNED_MASTER", "TIKTOK_CML"],
      silentPublishingAllowed: false,
      ownedMasterRequiresImmutableCommercialLicenseReceipt: true,
      cmlRequiresExactSelectionReceipt: true,
    }),
    cmlRegion: "GE",
    expectedAccountId: connection.externalAccountId,
    expectedUsername: connection.username,
    verifiedMediaHosts: [mediaHost],
    portalPermissions: [
      "Account User",
      "Get Account Media",
      "Account Post Content",
    ],
  };
}
