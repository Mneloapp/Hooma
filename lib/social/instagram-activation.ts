import "server-only";

import type { InstagramPublishingConnection } from "./connections";
import {
  INSTAGRAM_REELS_PUBLISH_SCHEMA_ID,
  type InstagramReelsPublishActivation,
} from "./providers/instagram-reels-publish";
import {
  INSTAGRAM_REELS_READ_SCHEMA_ID,
  type InstagramReelsReadActivation,
} from "./providers/instagram-reels-read";

const SHA256 = /^[a-f0-9]{64}$/;

function receipt(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!SHA256.test(value)) throw new Error(`INSTAGRAM_ACTIVATION_RECEIPT_MISSING:${name}`);
  return value;
}

export function instagramReadActivation(
  connection: InstagramPublishingConnection,
): InstagramReelsReadActivation {
  return {
    schemaId: INSTAGRAM_REELS_READ_SCHEMA_ID,
    apiVersion: "v25.0",
    endpointSchemaReceiptSha256: receipt("INSTAGRAM_ENDPOINT_SCHEMA_RECEIPT_SHA256"),
    connectionReceiptSha256: receipt("INSTAGRAM_CONNECTION_RECEIPT_SHA256"),
    identityReceiptSha256: receipt("INSTAGRAM_IDENTITY_RECEIPT_SHA256"),
    oauthScopeReceiptSha256: receipt("INSTAGRAM_OAUTH_SCOPE_RECEIPT_SHA256"),
    expectedAccountId: connection.externalAccountId,
    expectedUsername: connection.username,
    grantedScopes: connection.scopes,
  };
}

export function instagramPublishActivation(
  connection: InstagramPublishingConnection,
): InstagramReelsPublishActivation {
  return {
    schemaId: INSTAGRAM_REELS_PUBLISH_SCHEMA_ID,
    apiVersion: "v25.0",
    endpointSchemaReceiptSha256: receipt("INSTAGRAM_ENDPOINT_SCHEMA_RECEIPT_SHA256"),
    connectionReceiptSha256: receipt("INSTAGRAM_CONNECTION_RECEIPT_SHA256"),
    identityReceiptSha256: receipt("INSTAGRAM_IDENTITY_RECEIPT_SHA256"),
    oauthScopeReceiptSha256: receipt("INSTAGRAM_OAUTH_SCOPE_RECEIPT_SHA256"),
    stagingReceiptSha256: receipt("INSTAGRAM_STAGING_RECEIPT_SHA256"),
    canaryReceiptSha256: receipt("INSTAGRAM_CANARY_RECEIPT_SHA256"),
    expectedAccountId: connection.externalAccountId,
    expectedUsername: "hooma.ge",
    shareToFeed: true,
    shareToFacebook: false,
  };
}
