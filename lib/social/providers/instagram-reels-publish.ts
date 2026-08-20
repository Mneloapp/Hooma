import "server-only";

import { createHash } from "node:crypto";
import {
  instagramApiNetworkEnabled,
  instagramPublishingEnabled,
} from "../config";

const API_ORIGIN = "https://graph.instagram.com";
const API_VERSION = "v25.0";
const SHA256 = /^[a-f0-9]{64}$/;
const INSTAGRAM_ID = /^[1-9]\d{0,255}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.:-]{1,120}$/;

export const INSTAGRAM_REELS_PUBLISH_SCHEMA_ID =
  "instagram-login-reels-publish-v25.0-2026-08-21" as const;

export type InstagramReelsPublishActivation = {
  schemaId: typeof INSTAGRAM_REELS_PUBLISH_SCHEMA_ID;
  apiVersion: "v25.0";
  endpointSchemaReceiptSha256: string;
  connectionReceiptSha256: string;
  identityReceiptSha256: string;
  oauthScopeReceiptSha256: string;
  stagingReceiptSha256: string;
  canaryReceiptSha256: string;
  expectedAccountId: string;
  expectedUsername: "hooma.ge";
  shareToFeed: true;
  shareToFacebook: false;
};

type Operation = "container_create" | "media_publish";
type TransportRequest = {
  operation: Operation;
  url: URL;
  method: "POST";
  headers: Record<string, string>;
  body: URLSearchParams;
};

export type InstagramPublishTransport = (
  request: TransportRequest,
) => Promise<{ status: number; body: unknown }>;

export class InstagramReelsPublishError extends Error {
  readonly code: string;
  readonly operation: Operation | "activation";
  readonly requestId: string | null;
  readonly retryable: boolean;

  constructor(input: {
    code: string;
    operation: Operation | "activation";
    requestId?: string | null;
    retryable?: boolean;
  }) {
    const code = /^[A-Z0-9_]{3,80}$/.test(input.code)
      ? input.code
      : "UNEXPECTED_FAILURE";
    super(`INSTAGRAM_REELS_PUBLISH_ERROR:${input.operation}:${code}`);
    this.name = "InstagramReelsPublishError";
    this.code = code;
    this.operation = input.operation;
    this.requestId = input.requestId && SAFE_REQUEST_ID.test(input.requestId)
      ? input.requestId
      : null;
    this.retryable = input.retryable ?? false;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(value: Record<string, unknown> | null, keys: string[]) {
  return Boolean(value)
    && Object.keys(value!).length === keys.length
    && keys.every((key) => key in value!);
}

function instagramId(value: unknown) {
  return typeof value === "string" && INSTAGRAM_ID.test(value) ? value : null;
}

function httpsMediaUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4_096) return null;
  const url = new URL(value);
  return url.protocol === "https:"
    && !url.username
    && !url.password
    && !url.hash
    ? url.toString()
    : null;
}

function caption(value: unknown) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 2_200
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function activation(value: unknown): InstagramReelsPublishActivation | null {
  const parsed = record(value);
  const keys = [
    "schemaId",
    "apiVersion",
    "endpointSchemaReceiptSha256",
    "connectionReceiptSha256",
    "identityReceiptSha256",
    "oauthScopeReceiptSha256",
    "stagingReceiptSha256",
    "canaryReceiptSha256",
    "expectedAccountId",
    "expectedUsername",
    "shareToFeed",
    "shareToFacebook",
  ];
  if (
    !exactKeys(parsed, keys)
    || parsed?.schemaId !== INSTAGRAM_REELS_PUBLISH_SCHEMA_ID
    || parsed.apiVersion !== API_VERSION
    || parsed.expectedUsername !== "hooma.ge"
    || !instagramId(parsed.expectedAccountId)
    || parsed.shareToFeed !== true
    || parsed.shareToFacebook !== false
    || keys.filter((key) => key.endsWith("Sha256")).some(
      (key) => !SHA256.test(String(parsed[key] ?? "")),
    )
  ) return null;
  return parsed as InstagramReelsPublishActivation;
}

function requestSha256(operation: Operation, body: URLSearchParams) {
  return createHash("sha256")
    .update(`${operation}\n${body.toString()}`, "utf8")
    .digest("hex");
}

async function defaultTransport(request: TransportRequest) {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    cache: "no-store",
    redirect: "error",
  });
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 1_000_000) {
    throw new InstagramReelsPublishError({
      operation: request.operation,
      code: "RESPONSE_TOO_LARGE",
    });
  }
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new InstagramReelsPublishError({
      operation: request.operation,
      code: "INVALID_JSON_RESPONSE",
    });
  }
  return { status: response.status, body };
}

function checkedResponse(operation: Operation, status: number, value: unknown) {
  const body = record(value);
  const error = record(body?.error);
  const requestId = typeof error?.fbtrace_id === "string" ? error.fbtrace_id : null;
  if (status < 200 || status >= 300 || error) {
    const rawCode = typeof error?.code === "number" ? String(error.code) : "HTTP_FAILURE";
    throw new InstagramReelsPublishError({
      operation,
      code: /^[0-9]{1,10}$/.test(rawCode) ? `META_${rawCode}` : "HTTP_FAILURE",
      requestId,
      retryable: status === 429 || status >= 500,
    });
  }
  return body;
}

export class InstagramReelsPublishClient {
  private readonly active: InstagramReelsPublishActivation | null;
  private readonly networkRequested: boolean;
  private readonly publishingRequested: boolean;
  private readonly transport: InstagramPublishTransport;

  constructor(options: {
    activation?: unknown;
    networkEnabled?: boolean;
    publishingEnabled?: boolean;
    transport?: InstagramPublishTransport;
  } = {}) {
    this.active = activation(options.activation);
    this.networkRequested = options.networkEnabled === true;
    this.publishingRequested = options.publishingEnabled === true;
    this.transport = options.transport ?? defaultTransport;
  }

  connectionStatus() {
    return {
      schemaId: INSTAGRAM_REELS_PUBLISH_SCHEMA_ID,
      activationValid: this.active !== null,
      networkEnabled: this.networkRequested && instagramApiNetworkEnabled(),
      publishingEnabled: this.publishingRequested && instagramPublishingEnabled(),
    };
  }

  private ready(operation: Operation, accountId: string) {
    if (!this.active) {
      throw new InstagramReelsPublishError({ operation: "activation", code: "ACTIVATION_INVALID" });
    }
    if (!this.networkRequested || !instagramApiNetworkEnabled()) {
      throw new InstagramReelsPublishError({ operation, code: "NETWORK_DISABLED" });
    }
    if (!this.publishingRequested || !instagramPublishingEnabled()) {
      throw new InstagramReelsPublishError({ operation, code: "PUBLISHING_DISABLED" });
    }
    if (accountId !== this.active.expectedAccountId) {
      throw new InstagramReelsPublishError({ operation, code: "ACCOUNT_IDENTITY_MISMATCH" });
    }
    return this.active;
  }

  private async post(operation: Operation, path: string, body: URLSearchParams) {
    const url = new URL(`/${API_VERSION}/${path}`, API_ORIGIN);
    let transported: { status: number; body: unknown };
    try {
      transported = await this.transport({
        operation,
        url,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (error) {
      if (error instanceof InstagramReelsPublishError) throw error;
      throw new InstagramReelsPublishError({ operation, code: "NETWORK_FAILURE", retryable: true });
    }
    return checkedResponse(operation, transported.status, transported.body);
  }

  async createReelContainer(input: {
    accountId: string;
    videoUrl: string;
    caption: string;
    accessToken: string;
  }) {
    const active = this.ready("container_create", input.accountId);
    const videoUrl = httpsMediaUrl(input.videoUrl);
    const safeCaption = caption(input.caption);
    if (!videoUrl || !safeCaption || input.accessToken.length < 20) {
      throw new InstagramReelsPublishError({ operation: "container_create", code: "INPUT_INVALID" });
    }
    const body = new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption: safeCaption,
      share_to_feed: active.shareToFeed ? "true" : "false",
      access_token: input.accessToken,
    });
    const hashBody = new URLSearchParams(body);
    hashBody.set("access_token", "REDACTED");
    const response = await this.post("container_create", `${input.accountId}/media`, body);
    const containerId = instagramId(response?.id);
    if (!exactKeys(response, ["id"]) || !containerId) {
      throw new InstagramReelsPublishError({ operation: "container_create", code: "INVALID_RESPONSE" });
    }
    return { containerId, requestSha256: requestSha256("container_create", hashBody) };
  }

  async publishReel(input: {
    accountId: string;
    containerId: string;
    accessToken: string;
  }) {
    this.ready("media_publish", input.accountId);
    const containerId = instagramId(input.containerId);
    if (!containerId || input.accessToken.length < 20) {
      throw new InstagramReelsPublishError({ operation: "media_publish", code: "INPUT_INVALID" });
    }
    const body = new URLSearchParams({
      creation_id: containerId,
      access_token: input.accessToken,
    });
    const hashBody = new URLSearchParams(body);
    hashBody.set("access_token", "REDACTED");
    const response = await this.post("media_publish", `${input.accountId}/media_publish`, body);
    const mediaId = instagramId(response?.id);
    if (!exactKeys(response, ["id"]) || !mediaId) {
      throw new InstagramReelsPublishError({ operation: "media_publish", code: "INVALID_RESPONSE" });
    }
    return { mediaId, requestSha256: requestSha256("media_publish", hashBody) };
  }
}
