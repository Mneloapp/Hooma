import "server-only";

import { createHash } from "node:crypto";
import { providerConfig } from "../config";

type JsonObject = Record<string, unknown>;

const MAX_RESPONSE_BYTES = 1_000_000;
const FACEBOOK_ID = /^[1-9][0-9]{0,255}$/;

export class FacebookReelsError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly remoteSideEffectPossible: boolean;

  constructor(code: string, options: { retryable?: boolean; remoteSideEffectPossible?: boolean } = {}) {
    super(`FACEBOOK_REELS:${code}`);
    this.name = "FacebookReelsError";
    this.code = /^[A-Z0-9_]{3,80}$/.test(code) ? code : "FACEBOOK_REELS_FAILURE";
    this.retryable = options.retryable ?? false;
    this.remoteSideEffectPossible = options.remoteSideEffectPossible ?? false;
  }
}

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown, maximum = 16_384) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function nonnegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function graphUrl(path: string) {
  const config = providerConfig("facebook");
  return new URL(`/${config.graphApiVersion}/${path.replace(/^\//, "")}`, "https://graph.facebook.com");
}

function canonicalCaption(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function facebookCaptionSha256(value: string) {
  return createHash("sha256").update(canonicalCaption(value), "utf8").digest("hex");
}

async function fetchJson(
  url: URL | string,
  init: RequestInit,
  sideEffectPossible = false,
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new FacebookReelsError("NETWORK_FAILURE", {
      retryable: !sideEffectPossible,
      remoteSideEffectPossible: sideEffectPossible,
    });
  }
  const bodyText = await response.text().catch(() => "");
  if (Buffer.byteLength(bodyText, "utf8") > MAX_RESPONSE_BYTES) {
    throw new FacebookReelsError("RESPONSE_TOO_LARGE", { remoteSideEffectPossible: sideEffectPossible });
  }
  let body: unknown = null;
  if (bodyText) {
    try { body = JSON.parse(bodyText); } catch {
      throw new FacebookReelsError("INVALID_JSON", { remoteSideEffectPossible: sideEffectPossible });
    }
  }
  if (!response.ok) {
    const nested = object(object(body)?.error);
    const rawCode = nested?.code;
    const code = typeof rawCode === "number" || typeof rawCode === "string"
      ? `META_${String(rawCode).replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`.slice(0, 80)
      : `HTTP_${response.status}`;
    throw new FacebookReelsError(code, {
      retryable: !sideEffectPossible && (response.status === 408 || response.status === 429 || response.status >= 500),
      remoteSideEffectPossible: sideEffectPossible,
    });
  }
  return body;
}

function bearer(accessToken: string) {
  if (!text(accessToken)) throw new FacebookReelsError("INVALID_TOKEN");
  return { Authorization: `Bearer ${accessToken}` };
}

function uploadAuthorization(accessToken: string) {
  if (!text(accessToken)) throw new FacebookReelsError("INVALID_TOKEN");
  return { Authorization: `OAuth ${accessToken}` };
}

export type FacebookDuplicateResult =
  | { status: "CLEAR"; checked: number }
  | { status: "DUPLICATE"; checked: number; mediaId: string; permalink: string }
  | { status: "INCONCLUSIVE_PAGE_LIMIT"; checked: number };

export class FacebookReelsClient {
  async lookupOwnedDuplicate(input: {
    pageId: string;
    captionSha256: string;
    notBefore: string;
    maxPages: number;
  }, accessToken: string): Promise<FacebookDuplicateResult> {
    if (
      !FACEBOOK_ID.test(input.pageId)
      || !/^[a-f0-9]{64}$/.test(input.captionSha256)
      || !Number.isFinite(Date.parse(input.notBefore))
      || !Number.isInteger(input.maxPages)
      || input.maxPages < 1
      || input.maxPages > 5
    ) throw new FacebookReelsError("DUPLICATE_LOOKUP_INPUT_INVALID");
    // The video_reels edge is mutation-only. Read the Page's owned video edge
    // for duplicate reconciliation; qualifying vertical videos include Reels.
    let url: URL | null = graphUrl(`${input.pageId}/videos`);
    url.searchParams.set("fields", "id,description,permalink_url,created_time,status");
    url.searchParams.set("limit", "50");
    let checked = 0;
    for (let page = 0; page < input.maxPages && url; page += 1) {
      const body = object(await fetchJson(url, { method: "GET", headers: bearer(accessToken) }));
      const rows = Array.isArray(body?.data) ? body.data : [];
      for (const value of rows) {
        const row = object(value);
        const createdTime = text(row?.created_time, 128);
        if (createdTime && Date.parse(createdTime) < Date.parse(input.notBefore)) {
          return { status: "CLEAR", checked };
        }
        const mediaId = text(row?.id, 256);
        const description = typeof row?.description === "string" ? row.description : "";
        const permalink = text(row?.permalink_url, 2_048);
        checked += 1;
        if (
          mediaId && FACEBOOK_ID.test(mediaId)
          && permalink && /^https:\/\/(?:www\.)?facebook\.com\//.test(permalink)
          && facebookCaptionSha256(description) === input.captionSha256
        ) return { status: "DUPLICATE", checked, mediaId, permalink };
      }
      const next = text(object(body?.paging)?.next, 4_096);
      if (!next) return { status: "CLEAR", checked };
      const parsed = new URL(next);
      url = parsed.origin === "https://graph.facebook.com" ? parsed : null;
      if (!url) throw new FacebookReelsError("PAGING_URL_INVALID");
    }
    return url ? { status: "INCONCLUSIVE_PAGE_LIMIT", checked } : { status: "CLEAR", checked };
  }

  async startUpload(pageId: string, accessToken: string) {
    if (!FACEBOOK_ID.test(pageId)) throw new FacebookReelsError("PAGE_ID_INVALID");
    const url = graphUrl(`${pageId}/video_reels`);
    url.searchParams.set("upload_phase", "start");
    const body = object(await fetchJson(url, {
      method: "POST",
      headers: bearer(accessToken),
    }, true));
    const videoId = text(body?.video_id, 256);
    const uploadUrl = text(body?.upload_url, 4_096);
    if (!videoId || !FACEBOOK_ID.test(videoId) || !uploadUrl) {
      throw new FacebookReelsError("START_RESPONSE_INVALID", { remoteSideEffectPossible: true });
    }
    const parsedUploadUrl = new URL(uploadUrl);
    if (
      parsedUploadUrl.protocol !== "https:"
      || parsedUploadUrl.hostname !== "rupload.facebook.com"
      || parsedUploadUrl.username
      || parsedUploadUrl.password
    ) {
      throw new FacebookReelsError("UPLOAD_URL_INVALID", { remoteSideEffectPossible: true });
    }
    return { videoId, uploadUrl: parsedUploadUrl.toString() };
  }

  async uploadHostedVideo(input: {
    uploadUrl: string;
    videoUrl: string;
    accessToken: string;
  }) {
    const uploadUrl = new URL(input.uploadUrl);
    const videoUrl = new URL(input.videoUrl);
    if (
      uploadUrl.protocol !== "https:"
      || uploadUrl.hostname !== "rupload.facebook.com"
      || uploadUrl.username
      || uploadUrl.password
      || videoUrl.protocol !== "https:"
      || videoUrl.username
      || videoUrl.password
    ) {
      throw new FacebookReelsError("UPLOAD_INPUT_INVALID");
    }
    const body = object(await fetchJson(uploadUrl, {
      method: "POST",
      headers: {
        ...uploadAuthorization(input.accessToken),
        file_url: videoUrl.toString(),
      },
    }, true));
    if (body?.success !== true) {
      throw new FacebookReelsError("UPLOAD_NOT_ACCEPTED", { remoteSideEffectPossible: true });
    }
  }

  async finishUpload(input: {
    pageId: string;
    videoId: string;
    caption: string;
    accessToken: string;
  }) {
    if (!FACEBOOK_ID.test(input.pageId) || !FACEBOOK_ID.test(input.videoId)) {
      throw new FacebookReelsError("FINISH_INPUT_INVALID");
    }
    const url = graphUrl(`${input.pageId}/video_reels`);
    const form = new URLSearchParams({
      upload_phase: "finish",
      video_id: input.videoId,
      video_state: "PUBLISHED",
      description: canonicalCaption(input.caption),
    });
    const body = object(await fetchJson(url, {
      method: "POST",
      headers: {
        ...bearer(input.accessToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    }, true));
    if (body?.success !== true) {
      throw new FacebookReelsError("FINISH_NOT_ACCEPTED", { remoteSideEffectPossible: true });
    }
  }

  async fetchVideo(input: { videoId: string; accessToken: string }) {
    if (!FACEBOOK_ID.test(input.videoId)) throw new FacebookReelsError("VIDEO_ID_INVALID");
    const url = graphUrl(input.videoId);
    url.searchParams.set("fields", "id,status,permalink_url");
    const body = object(await fetchJson(url, { method: "GET", headers: bearer(input.accessToken) }));
    const id = text(body?.id, 256);
    const status = object(body?.status);
    const videoStatus = text(status?.video_status, 80)?.toUpperCase() ?? null;
    const uploadingStatus = text(object(status?.uploading_phase)?.status, 80)?.toUpperCase() ?? null;
    const processingStatus = text(object(status?.processing_phase)?.status, 80)?.toUpperCase() ?? null;
    const publishingStatus = text(object(status?.publishing_phase)?.status, 80)?.toUpperCase() ?? null;
    const permalink = text(body?.permalink_url, 2_048);
    if (id !== input.videoId || !videoStatus) throw new FacebookReelsError("STATUS_RESPONSE_INVALID");
    return {
      videoId: id,
      videoStatus,
      uploadingStatus,
      processingStatus,
      publishingStatus,
      permalink,
    };
  }

  async fetchMetrics(input: { videoId: string; accessToken: string }) {
    if (!FACEBOOK_ID.test(input.videoId)) throw new FacebookReelsError("VIDEO_ID_INVALID");
    const engagementUrl = graphUrl(input.videoId);
    engagementUrl.searchParams.set("fields", "likes.limit(0).summary(true),comments.limit(0).summary(true)");
    const insightsUrl = graphUrl(`${input.videoId}/video_insights`);
    insightsUrl.searchParams.set("metric", "total_video_views");
    const [engagementBody, insightsBody] = await Promise.all([
      fetchJson(engagementUrl, { method: "GET", headers: bearer(input.accessToken) }),
      fetchJson(insightsUrl, { method: "GET", headers: bearer(input.accessToken) }),
    ]);
    const engagement = object(engagementBody);
    const insightRows = Array.isArray(object(insightsBody)?.data)
      ? object(insightsBody)!.data as unknown[]
      : [];
    const viewsRow = insightRows.map(object).find((row) => row?.name === "total_video_views");
    const values = Array.isArray(viewsRow?.values) ? viewsRow.values : [];
    const views = values.length > 0 ? nonnegative(object(values.at(-1))?.value) : null;
    return {
      views,
      likes: nonnegative(object(object(engagement?.likes)?.summary)?.total_count),
      comments: nonnegative(object(object(engagement?.comments)?.summary)?.total_count),
      shares: null,
      reach: null,
    };
  }
}
