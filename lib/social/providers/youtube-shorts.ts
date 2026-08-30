import "server-only";

import { createHash } from "node:crypto";

type JsonObject = Record<string, unknown>;

const API_ORIGIN = "https://www.googleapis.com";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_SHORT_BYTES = 128 * 1024 * 1024;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export class YouTubeShortsError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly remoteSideEffectPossible: boolean;

  constructor(code: string, options: { retryable?: boolean; remoteSideEffectPossible?: boolean } = {}) {
    super(`YOUTUBE_SHORTS:${code}`);
    this.name = "YouTubeShortsError";
    this.code = /^[A-Z0-9_]{3,80}$/.test(code) ? code : "YOUTUBE_SHORTS_FAILURE";
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
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function canonicalDescription(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function youtubeDescriptionSha256(value: string) {
  return createHash("sha256").update(canonicalDescription(value), "utf8").digest("hex");
}

function bearer(accessToken: string) {
  if (!text(accessToken)) throw new YouTubeShortsError("INVALID_TOKEN");
  return { Authorization: `Bearer ${accessToken}` };
}

async function readJson(response: Response, sideEffectPossible: boolean) {
  const raw = await response.text().catch(() => "");
  if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
    throw new YouTubeShortsError("RESPONSE_TOO_LARGE", { remoteSideEffectPossible: sideEffectPossible });
  }
  if (!raw) return null;
  try { return JSON.parse(raw) as unknown; } catch {
    throw new YouTubeShortsError("INVALID_JSON", { remoteSideEffectPossible: sideEffectPossible });
  }
}

async function requestJson(
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
      signal: AbortSignal.timeout(sideEffectPossible ? 120_000 : 20_000),
    });
  } catch {
    throw new YouTubeShortsError("NETWORK_FAILURE", {
      retryable: !sideEffectPossible,
      remoteSideEffectPossible: sideEffectPossible,
    });
  }
  const body = await readJson(response, sideEffectPossible);
  if (!response.ok) {
    const error = object(object(body)?.error);
    const reasons = Array.isArray(error?.errors) ? error.errors : [];
    const reason = text(object(reasons[0])?.reason, 120);
    const code = reason
      ? `YOUTUBE_${reason.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`.slice(0, 80)
      : `HTTP_${response.status}`;
    throw new YouTubeShortsError(code, {
      retryable: !sideEffectPossible && (response.status === 408 || response.status === 429 || response.status >= 500),
      remoteSideEffectPossible: sideEffectPossible,
    });
  }
  return { body, response };
}

export type YouTubeDuplicateResult =
  | { status: "CLEAR"; checked: number }
  | { status: "DUPLICATE"; checked: number; videoId: string; url: string }
  | { status: "INCONCLUSIVE_PAGE_LIMIT"; checked: number };

export class YouTubeShortsClient {
  async lookupOwnedDuplicate(input: {
    channelId: string;
    descriptionSha256: string;
    notBefore: string;
    maxPages: number;
  }, accessToken: string): Promise<YouTubeDuplicateResult> {
    if (
      !CHANNEL_ID.test(input.channelId)
      || !/^[a-f0-9]{64}$/.test(input.descriptionSha256)
      || !Number.isFinite(Date.parse(input.notBefore))
      || !Number.isInteger(input.maxPages)
      || input.maxPages < 1
      || input.maxPages > 5
    ) throw new YouTubeShortsError("DUPLICATE_LOOKUP_INPUT_INVALID");

    let pageToken: string | null = null;
    let checked = 0;
    for (let page = 0; page < input.maxPages; page += 1) {
      const search = new URL("/youtube/v3/search", API_ORIGIN);
      search.searchParams.set("part", "id");
      search.searchParams.set("channelId", input.channelId);
      search.searchParams.set("type", "video");
      search.searchParams.set("order", "date");
      search.searchParams.set("publishedAfter", new Date(input.notBefore).toISOString());
      search.searchParams.set("maxResults", "50");
      if (pageToken) search.searchParams.set("pageToken", pageToken);
      const searchBody = object((await requestJson(search, {
        method: "GET",
        headers: bearer(accessToken),
      })).body);
      const searchItems = Array.isArray(searchBody?.items) ? searchBody.items : [];
      const ids = searchItems.flatMap((value) => {
        const id = text(object(object(value)?.id)?.videoId, 32);
        return id && VIDEO_ID.test(id) ? [id] : [];
      });
      if (ids.length) {
        const videos = new URL("/youtube/v3/videos", API_ORIGIN);
        videos.searchParams.set("part", "id,snippet,status");
        videos.searchParams.set("id", ids.join(","));
        videos.searchParams.set("maxResults", "50");
        const videosBody = object((await requestJson(videos, {
          method: "GET",
          headers: bearer(accessToken),
        })).body);
        for (const value of Array.isArray(videosBody?.items) ? videosBody.items : []) {
          const row = object(value);
          const id = text(row?.id, 32);
          const snippet = object(row?.snippet);
          const channelId = text(snippet?.channelId, 64);
          const description = typeof snippet?.description === "string" ? snippet.description : "";
          checked += 1;
          if (
            id && VIDEO_ID.test(id)
            && channelId === input.channelId
            && youtubeDescriptionSha256(description) === input.descriptionSha256
          ) return { status: "DUPLICATE", checked, videoId: id, url: `https://www.youtube.com/shorts/${id}` };
        }
      }
      pageToken = text(searchBody?.nextPageToken, 256);
      if (!pageToken) return { status: "CLEAR", checked };
    }
    return pageToken
      ? { status: "INCONCLUSIVE_PAGE_LIMIT", checked }
      : { status: "CLEAR", checked };
  }

  async createResumableSession(input: {
    accessToken: string;
    title: string;
    description: string;
    sizeBytes: number;
    publishAt?: string | null;
  }) {
    const title = input.title.trim().slice(0, 100);
    const description = canonicalDescription(input.description).slice(0, 5_000);
    if (
      !title
      || !description
      || !Number.isInteger(input.sizeBytes)
      || input.sizeBytes < 1
      || input.sizeBytes > MAX_SHORT_BYTES
      || (input.publishAt && !Number.isFinite(Date.parse(input.publishAt)))
    ) throw new YouTubeShortsError("UPLOAD_METADATA_INVALID");
    const url = new URL("/upload/youtube/v3/videos", API_ORIGIN);
    url.searchParams.set("uploadType", "resumable");
    url.searchParams.set("part", "snippet,status");
    url.searchParams.set("notifySubscribers", "false");
    const metadata = {
      snippet: {
        title,
        description,
        categoryId: "22",
        defaultLanguage: "ka",
        defaultAudioLanguage: "ka",
      },
      status: {
        privacyStatus: input.publishAt ? "private" : "public",
        publishAt: input.publishAt ?? undefined,
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
        embeddable: true,
        publicStatsViewable: true,
      },
    };
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          ...bearer(input.accessToken),
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(input.sizeBytes),
          "X-Upload-Content-Type": "video/mp4",
        },
        body: JSON.stringify(metadata),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new YouTubeShortsError("SESSION_NETWORK_FAILURE", { remoteSideEffectPossible: true });
    }
    if (!response.ok) {
      await readJson(response, true);
      throw new YouTubeShortsError(`SESSION_HTTP_${response.status}`, { remoteSideEffectPossible: true });
    }
    const location = response.headers.get("location");
    if (!location) throw new YouTubeShortsError("SESSION_LOCATION_MISSING", { remoteSideEffectPossible: true });
    const parsed = new URL(location);
    if (parsed.protocol !== "https:" || parsed.origin !== API_ORIGIN || parsed.username || parsed.password) {
      throw new YouTubeShortsError("SESSION_LOCATION_INVALID", { remoteSideEffectPossible: true });
    }
    return { uploadUrl: parsed.toString(), metadata };
  }

  async uploadFromSignedUrl(input: {
    uploadUrl: string;
    videoUrl: string;
    expectedSha256: string;
    expectedSizeBytes: number;
  }) {
    const uploadUrl = new URL(input.uploadUrl);
    const videoUrl = new URL(input.videoUrl);
    if (
      uploadUrl.origin !== API_ORIGIN
      || videoUrl.protocol !== "https:"
      || !/^[a-f0-9]{64}$/.test(input.expectedSha256)
      || !Number.isInteger(input.expectedSizeBytes)
      || input.expectedSizeBytes < 1
      || input.expectedSizeBytes > MAX_SHORT_BYTES
    ) throw new YouTubeShortsError("UPLOAD_INPUT_INVALID");

    let source: Response;
    try {
      source = await fetch(videoUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new YouTubeShortsError("SOURCE_DOWNLOAD_FAILED");
    }
    if (!source.ok) throw new YouTubeShortsError("SOURCE_DOWNLOAD_FAILED");
    const buffer = Buffer.from(await source.arrayBuffer());
    if (
      buffer.byteLength !== input.expectedSizeBytes
      || createHash("sha256").update(buffer).digest("hex") !== input.expectedSha256
    ) throw new YouTubeShortsError("SOURCE_BINDING_MISMATCH");

    const result = await requestJson(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.byteLength),
      },
      body: buffer,
    }, true);
    const body = object(result.body);
    const videoId = text(body?.id, 32);
    if (!videoId || !VIDEO_ID.test(videoId)) {
      throw new YouTubeShortsError("UPLOAD_RESPONSE_INVALID", { remoteSideEffectPossible: true });
    }
    return { videoId, url: `https://www.youtube.com/shorts/${videoId}` };
  }

  async fetchVideo(input: { videoId: string; accessToken: string }) {
    if (!VIDEO_ID.test(input.videoId)) throw new YouTubeShortsError("VIDEO_ID_INVALID");
    const url = new URL("/youtube/v3/videos", API_ORIGIN);
    url.searchParams.set("part", "id,snippet,status,processingDetails");
    url.searchParams.set("id", input.videoId);
    const body = object((await requestJson(url, {
      method: "GET",
      headers: bearer(input.accessToken),
    })).body);
    const items = Array.isArray(body?.items) ? body.items : [];
    const row = items.length === 1 ? object(items[0]) : null;
    const status = object(row?.status);
    const processing = object(row?.processingDetails);
    const uploadStatus = text(status?.uploadStatus, 80);
    const processingStatus = text(processing?.processingStatus, 80);
    if (row?.id !== input.videoId || !uploadStatus) throw new YouTubeShortsError("STATUS_RESPONSE_INVALID");
    return {
      videoId: input.videoId,
      uploadStatus,
      processingStatus,
      privacyStatus: text(status?.privacyStatus, 80),
      rejectionReason: text(status?.rejectionReason, 120),
      url: `https://www.youtube.com/shorts/${input.videoId}`,
    };
  }

  async fetchMetrics(input: { videoId: string; accessToken: string }) {
    if (!VIDEO_ID.test(input.videoId)) throw new YouTubeShortsError("VIDEO_ID_INVALID");
    const url = new URL("/youtube/v3/videos", API_ORIGIN);
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", input.videoId);
    const body = object((await requestJson(url, {
      method: "GET",
      headers: bearer(input.accessToken),
    })).body);
    const items = Array.isArray(body?.items) ? body.items : [];
    const statistics = items.length === 1 ? object(object(items[0])?.statistics) : null;
    return {
      views: nonnegative(statistics?.viewCount),
      likes: nonnegative(statistics?.likeCount),
      comments: nonnegative(statistics?.commentCount),
      favorites: nonnegative(statistics?.favoriteCount),
    };
  }
}
