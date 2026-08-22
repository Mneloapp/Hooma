import "server-only";

import {
  socialPublishingEnabled,
  tiktokAppReviewApproved,
  tiktokOAuthEnabled,
  tiktokOrganicNetworkEnabled,
  tiktokOrganicPublishingEnabled,
} from "@/lib/social/config";
import { createAdminClient } from "@/lib/supabase/admin";

export type AutomationProvider = "tiktok" | "instagram";

type ConnectionRow = {
  provider: AutomationProvider;
  username: string;
  scopes: string[] | null;
  access_expires_at: string;
  refresh_after: string;
  status: "active" | "reauth_required" | "revoked";
  last_refreshed_at: string | null;
  last_verified_at: string | null;
  last_error_code: string | null;
};

type JobRow = {
  id: string;
  provider: AutomationProvider;
  state: string;
  scheduled_at: string;
  publish_not_after: string;
  publishing_allowed: boolean;
  approval_status: string;
  music_mode: string;
  rights_status: string;
  visual_claims_status: string;
  remote_duplicate_status: string;
  last_error_code: string | null;
};

type ReceiptRow = {
  job_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type AuditRow = {
  job_id: string;
  event_type: string;
  actor_type: string;
  created_at: string;
};

type ConnectionAuditRow = {
  action: string;
  created_at: string;
};

export type AppReviewSnapshot = {
  provider: AutomationProvider;
  status: "approved" | "pending" | "unknown";
  verifiedAt: string | null;
  evidence: "configuration_receipt" | "connection_proven" | "unavailable";
};

export type ConnectionSnapshot = {
  provider: AutomationProvider;
  connected: boolean;
  identityVerified: boolean;
  status: "active" | "reauth_required" | "revoked" | "not_connected";
  username: "@hooma.ge" | null;
  permissionCount: number;
  tokenHealth: "healthy" | "expiring" | "expired" | "unavailable";
  accessExpiresAt: string | null;
  refreshAfter: string | null;
  lastRefreshedAt: string | null;
  lastVerifiedAt: string | null;
  needsAttention: boolean;
};

export type AutomationSwitches = {
  globalPublishing: boolean;
  stagingConfigured: boolean;
  providers: Record<AutomationProvider, {
    oauthMaintenance: boolean;
    publishing: boolean;
    apiNetwork: boolean;
    insights: boolean;
  }>;
};

export type JobSnapshot = {
  provider: AutomationProvider;
  state: string;
  scheduledAt: string;
  publishNotAfter: string;
  publishingAllowed: boolean;
  approvalStatus: string;
  musicMode: string;
  blockers: string[];
};

export type MetricSnapshot = {
  provider: AutomationProvider | null;
  capturedAt: string;
  views: number | null;
  comments: number | null;
  clicks: number | null;
};

export type SafeAutomationEvent = {
  provider: AutomationProvider | null;
  kind: "receipt" | "audit" | "connection";
  label: string;
  createdAt: string;
};

export type SocialAutomationDashboardData = {
  generatedAt: string;
  setupReady: boolean;
  warningCodes: string[];
  availability: {
    connections: boolean;
    jobs: boolean;
    receipts: boolean;
    audit: boolean;
    metrics: boolean;
  };
  switches: AutomationSwitches;
  appReviews: AppReviewSnapshot[];
  connections: ConnectionSnapshot[];
  jobs: JobSnapshot[];
  metrics: MetricSnapshot[];
  events: SafeAutomationEvent[];
};

const providers: AutomationProvider[] = ["tiktok", "instagram"];
const terminalStates = new Set(["published", "failed", "cancelled", "blocked_policy", "blocked_remote_uncertain"]);
const stagedStates = new Set(["media_staged", "claimed", "publishing", "published"]);

export function isTerminalAutomationJobState(state: string) {
  return terminalStates.has(state);
}

function enabled(name: string) {
  return process.env[name]?.trim() === "1";
}

function hasSafeStagingOrigin() {
  const raw = process.env.HOOMA_SOCIAL_MEDIA_BASE_URL?.trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function readSwitches(): AutomationSwitches {
  const globalPublishing = socialPublishingEnabled();
  const instagramNetwork = enabled("HOOMA_INSTAGRAM_API_NETWORK_ENABLED");
  const tiktokNetwork = tiktokOrganicNetworkEnabled();
  const instagramOAuthSetting = process.env.HOOMA_INSTAGRAM_OAUTH_ENABLED;
  return {
    globalPublishing,
    stagingConfigured: hasSafeStagingOrigin(),
    providers: {
      tiktok: {
        oauthMaintenance: tiktokOAuthEnabled(),
        publishing: tiktokOrganicPublishingEnabled(),
        apiNetwork: tiktokNetwork,
        insights: tiktokNetwork && enabled("HOOMA_TIKTOK_INSIGHTS_ENABLED"),
      },
      instagram: {
        oauthMaintenance: instagramOAuthSetting === undefined
          ? globalPublishing
          : instagramOAuthSetting.trim() === "1",
        publishing: globalPublishing && enabled("HOOMA_INSTAGRAM_PUBLISHING_ENABLED"),
        apiNetwork: instagramNetwork,
        insights: instagramNetwork && enabled("HOOMA_INSTAGRAM_INSIGHTS_ENABLED"),
      },
    },
  };
}

function readAppReviews(instagramConnection?: ConnectionSnapshot): AppReviewSnapshot[] {
  const tiktokApproved = tiktokAppReviewApproved();
  const instagramConnected = instagramConnection?.connected ?? false;
  return [
    {
      provider: "tiktok",
      status: tiktokApproved ? "approved" : "unknown",
      verifiedAt: null,
      evidence: tiktokApproved ? "configuration_receipt" : "unavailable",
    },
    {
      provider: "instagram",
      status: instagramConnected ? "approved" : "unknown",
      verifiedAt: instagramConnection?.lastVerifiedAt ?? null,
      evidence: instagramConnected ? "connection_proven" : "unavailable",
    },
  ];
}

function tokenHealth(row: ConnectionRow | undefined, now: number): ConnectionSnapshot["tokenHealth"] {
  if (!row?.access_expires_at) return "unavailable";
  const expiresAt = Date.parse(row.access_expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return "expired";
  return expiresAt - now <= 7 * 24 * 60 * 60 * 1000 ? "expiring" : "healthy";
}

function safeConnection(provider: AutomationProvider, row: ConnectionRow | undefined, now: number): ConnectionSnapshot {
  const identityVerified = row?.username?.replace(/^@/, "").toLowerCase() === "hooma.ge";
  const health = tokenHealth(row, now);
  const status = row?.status ?? "not_connected";
  return {
    provider,
    connected: status === "active" && identityVerified && health !== "expired",
    identityVerified,
    status,
    username: identityVerified ? "@hooma.ge" : null,
    permissionCount: Array.isArray(row?.scopes) ? row.scopes.length : 0,
    tokenHealth: health,
    accessExpiresAt: row?.access_expires_at ?? null,
    refreshAfter: row?.refresh_after ?? null,
    lastRefreshedAt: row?.last_refreshed_at ?? null,
    lastVerifiedAt: row?.last_verified_at ?? null,
    needsAttention: status !== "active" || !identityVerified || health === "expired" || Boolean(row?.last_error_code),
  };
}

function safeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function metricValue(payload: Record<string, unknown> | null, aliases: string[]) {
  if (!payload) return null;
  const nested = payload.metrics;
  const sources = [payload, typeof nested === "object" && nested !== null && !Array.isArray(nested) ? nested as Record<string, unknown> : null];
  for (const source of sources) {
    if (!source) continue;
    for (const alias of aliases) {
      const value = safeNumber(source[alias]);
      if (value !== null) return value;
    }
  }
  return null;
}

function receiptLabel(eventType: string) {
  const labels: Record<string, string> = {
    PREFLIGHT_PASSED: "გამოქვეყნების წინასწარი შემოწმება გაიარა",
    PUBLISH_REQUESTED: "პლატფორმაზე გაგზავნა დაიწყო",
    PUBLISH_SUCCEEDED: "გამოქვეყნება დადასტურდა",
    PUBLISH_FAILED: "გამოქვეყნება უსაფრთხოდ შეჩერდა",
    REMOTE_RESULT_UNCERTAIN: "პლატფორმის პასუხი შესამოწმებელია",
    REMOTE_VERIFIED: "პლატფორმის შედეგი გადამოწმდა",
    REMOTE_DUPLICATE_FOUND: "დუბლიკატი აღმოჩნდა და ატვირთვა შეჩერდა",
    CANCELLED: "დაგეგმილი ატვირთვა გაუქმდა",
    ANALYTICS_SNAPSHOT: "შედეგების ახალი სურათი ჩაიწერა",
  };
  return labels[eventType] ?? "სისტემური ქვითარი ჩაიწერა";
}

function auditLabel(eventType: string) {
  const labels: Record<string, string> = {
    APPROVAL_GRANTED: "ზუსტი მფლობელის დასტური ჩაიწერა",
    APPROVAL_REVOKED: "მფლობელის დასტური გაუქმდა",
    JOB_CLAIMED: "გამომქვეყნებელმა ჩანაწერი აიღო",
    PREFLIGHT_BLOCKED: "უსაფრთხოების შემოწმებამ ჩანაწერი დაბლოკა",
    STATE_CHANGED: "ავტომატიზაციის მდგომარეობა შეიცვალა",
  };
  return labels[eventType] ?? "უსაფრთხოების აუდიტის მოვლენა ჩაიწერა";
}

function connectionAuditLabel(action: string) {
  const labels: Record<string, string> = {
    social_connection_authorized: "სოციალური ანგარიში უსაფრთხოდ დაუკავშირდა Hooma-ს",
    social_connection_token_refreshed: "ანგარიშის ავტორიზაცია ავტომატურად განახლდა",
    social_oauth_state_consumed: "ავტორიზაციის ერთჯერადი დასტური გამოყენებულია",
  };
  return labels[action] ?? "კავშირის აუდიტის მოვლენა ჩაიწერა";
}

function jobBlockers(
  row: JobRow,
  connections: Map<AutomationProvider, ConnectionSnapshot>,
  switches: AutomationSwitches,
  now: number,
) {
  if (terminalStates.has(row.state)) return [];
  const blockers: string[] = [];
  if (row.approval_status !== "APPROVED_EXACT") blockers.push("ელოდება გიორგის ზუსტ დასტურს");
  if (!row.publishing_allowed) blockers.push("ამ ჩანაწერის გამოქვეყნება ჩაკეტილია");
  if (row.rights_status !== "CLEARED") blockers.push("გამოყენების უფლებები დასადასტურებელია");
  if (row.visual_claims_status !== "CLEARED") blockers.push("ვიზუალური შესაბამისობა დასადასტურებელია");
  // Remote duplicate lookup is an atomic due-time preflight, not a queue
  // blocker while an approved job is waiting for its scheduled window.
  if (!connections.get(row.provider)?.connected) blockers.push("პლატფორმის OAuth კავშირი მზად არ არის");
  if (!switches.providers[row.provider].publishing) blockers.push("პლატფორმის kill-switch გამორთულია");
  if (!switches.stagingConfigured || (!stagedStates.has(row.state) && Date.parse(row.scheduled_at) <= now)) blockers.push("მედია staging-ზე მზად არ არის");
  if (Date.parse(row.publish_not_after) < now) blockers.push("გამოქვეყნების უსაფრთხო ვადა გასულია");
  if (row.provider === "instagram" && row.music_mode !== "HOOMA_OWNED_MASTER") blockers.push("Instagram-ს ლიცენზირებული შერეული მუსიკა სჭირდება");
  if (row.provider === "tiktok" && !new Set(["TIKTOK_CML", "HOOMA_OWNED_MASTER"]).has(row.music_mode)) blockers.push("TikTok-ის მუსიკის ქვითარი არ არის მზად");
  return [...new Set(blockers)];
}

export async function loadSocialAutomationDashboard(): Promise<SocialAutomationDashboardData> {
  const generatedAt = new Date().toISOString();
  const now = Date.parse(generatedAt);
  const switches = readSwitches();
  const admin = createAdminClient() as any;

  if (!admin) {
    return {
      generatedAt,
      setupReady: false,
      warningCodes: ["SERVER_DATA_ACCESS_UNAVAILABLE"],
      availability: {
        connections: false,
        jobs: false,
        receipts: false,
        audit: false,
        metrics: false,
      },
      switches,
      appReviews: readAppReviews(),
      connections: providers.map((provider) => safeConnection(provider, undefined, now)),
      jobs: [],
      metrics: [],
      events: [],
    };
  }

  const [connectionsResult, jobsResult, receiptsResult, auditResult, connectionAuditResult] = await Promise.all([
    admin.from("social_connections")
      .select("provider,username,scopes,access_expires_at,refresh_after,status,last_refreshed_at,last_verified_at,last_error_code")
      .in("provider", providers),
    admin.from("social_publish_jobs")
      .select("id,provider,state,scheduled_at,publish_not_after,publishing_allowed,approval_status,music_mode,rights_status,visual_claims_status,remote_duplicate_status,last_error_code")
      .order("scheduled_at", { ascending: false })
      .limit(120),
    admin.from("social_publish_receipts")
      .select("job_id,event_type,payload,created_at")
      .order("created_at", { ascending: false })
      .limit(60),
    admin.from("social_publish_audit_events")
      .select("job_id,event_type,actor_type,created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    admin.from("audit_log")
      .select("action,created_at")
      .eq("entity_type", "social_connection")
      .in("action", ["social_connection_authorized", "social_connection_token_refreshed", "social_oauth_state_consumed"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const warningCodes = [
    connectionsResult.error ? "CONNECTION_STATE_UNAVAILABLE" : null,
    jobsResult.error ? "QUEUE_STATE_UNAVAILABLE" : null,
    receiptsResult.error ? "RECEIPTS_UNAVAILABLE" : null,
    auditResult.error ? "PUBLISH_AUDIT_UNAVAILABLE" : null,
    connectionAuditResult.error ? "CONNECTION_AUDIT_UNAVAILABLE" : null,
  ].filter((value): value is string => Boolean(value));
  const availability = {
    connections: !connectionsResult.error,
    jobs: !jobsResult.error,
    receipts: !receiptsResult.error,
    audit: !auditResult.error && !connectionAuditResult.error,
    metrics: !receiptsResult.error,
  };

  const connectionRows = (connectionsResult.data ?? []) as ConnectionRow[];
  const connections = providers.map((provider) => safeConnection(provider, connectionRows.find((row) => row.provider === provider), now));
  const connectionsByProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  const appReviews = readAppReviews(connectionsByProvider.get("instagram"));

  const rawJobs = (jobsResult.data ?? []) as JobRow[];
  const jobProvider = new Map(rawJobs.map((job) => [job.id, job.provider]));
  const jobs = rawJobs.map((row) => ({
    provider: row.provider,
    state: row.state,
    scheduledAt: row.scheduled_at,
    publishNotAfter: row.publish_not_after,
    publishingAllowed: row.publishing_allowed,
    approvalStatus: row.approval_status,
    musicMode: row.music_mode,
    blockers: jobBlockers(row, connectionsByProvider, switches, now),
  }));

  const receipts = (receiptsResult.data ?? []) as ReceiptRow[];
  const metrics = receipts
    .filter((receipt) => receipt.event_type === "ANALYTICS_SNAPSHOT")
    .map((receipt): MetricSnapshot => ({
      provider: jobProvider.get(receipt.job_id) ?? null,
      capturedAt: receipt.created_at,
      views: metricValue(receipt.payload, ["views", "view_count", "plays", "play_count"]),
      comments: metricValue(receipt.payload, ["comments", "comment_count"]),
      clicks: metricValue(receipt.payload, ["clicks", "link_clicks", "website_clicks"]),
    }))
    .slice(0, 8);

  const receiptEvents: SafeAutomationEvent[] = receipts.slice(0, 20).map((receipt) => ({
    provider: jobProvider.get(receipt.job_id) ?? null,
    kind: "receipt",
    label: receiptLabel(receipt.event_type),
    createdAt: receipt.created_at,
  }));
  const auditEvents: SafeAutomationEvent[] = ((auditResult.data ?? []) as AuditRow[]).slice(0, 20).map((event) => ({
    provider: jobProvider.get(event.job_id) ?? null,
    kind: "audit",
    label: auditLabel(event.event_type),
    createdAt: event.created_at,
  }));
  const connectionEvents: SafeAutomationEvent[] = ((connectionAuditResult.data ?? []) as ConnectionAuditRow[]).map((event) => ({
    provider: null,
    kind: "connection",
    label: connectionAuditLabel(event.action),
    createdAt: event.created_at,
  }));
  const events = [...receiptEvents, ...auditEvents, ...connectionEvents]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 12);

  return {
    generatedAt,
    setupReady: Object.values(availability).every(Boolean),
    warningCodes,
    availability,
    switches,
    appReviews,
    connections,
    jobs,
    metrics,
    events,
  };
}
