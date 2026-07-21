import { link, mkdir, open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { createProductAuditorFromEnv } from "./product-auditor.mjs";

const auditProtocolVersion = "20260721-audit-at-most-once-v1";
const here = path.dirname(fileURLToPath(import.meta.url));
const extractorPath = path.resolve(here, "../hooma-catalog-clipper/extractor.js");
const extractorSource = await readFile(extractorPath, "utf8");
const baseUrl = String(process.env.HOOMA_BASE_URL ?? "").replace(/\/+$/, "");
const token = String(process.env.HOOMA_AGENT_TOKEN ?? "").trim();
const workerName = String(process.env.HOOMA_AGENT_WORKER_NAME ?? "Hooma Windows Worker").trim();
const profilePath = path.resolve(here, process.env.HOOMA_BROWSER_PROFILE || ".hooma-browser-profile");
const pollSeconds = Math.max(5, Number(process.env.HOOMA_POLL_SECONDS ?? 15) || 15);
const headless = String(process.env.HOOMA_HEADLESS ?? "false").toLowerCase() === "true";
const channel = String(process.env.HOOMA_BROWSER_CHANNEL ?? "chrome").trim();
const workerMode = String(process.env.HOOMA_WORKER_MODE ?? "all").trim().toLowerCase();
const auditConcurrency = Math.min(8, Math.max(1, Number(process.env.HOOMA_AUDIT_CONCURRENCY ?? 2) || 2));
const auditDelayMs = Math.min(60_000, Math.max(0, Number(process.env.HOOMA_AUDIT_DELAY_MS ?? 500) || 0));
const auditDeliveryAttempts = Math.min(10, Math.max(1, Number(process.env.HOOMA_AUDIT_DELIVERY_ATTEMPTS ?? 5) || 5));
const auditSpoolDirectory = path.resolve(here, process.env.HOOMA_AUDIT_SPOOL_DIR || ".audit-result-spool");
const auditSpoolQuarantineDirectory = path.join(auditSpoolDirectory, "quarantine");
const auditConfigured = String(process.env.OPENAI_API_KEY ?? "").trim().startsWith("sk-");
const auditProduct = createProductAuditorFromEnv();

if (!/^https:\/\//i.test(baseUrl)) throw new Error("HOOMA_BASE_URL must be an HTTPS URL.");
if (!/^hooma_ca_[a-f0-9]{12}_[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error("HOOMA_AGENT_TOKEN is missing or invalid.");
if (!["all", "import", "audit"].includes(workerMode)) throw new Error("HOOMA_WORKER_MODE must be all, import, or audit.");
if (workerMode === "audit" && !auditConfigured) throw new Error("OPENAI_API_KEY is required when HOOMA_WORKER_MODE=audit.");

const log = (message, details) => {
  const suffix = details === undefined ? "" : ` ${typeof details === "string" ? details : JSON.stringify(details)}`;
  process.stdout.write(`[${new Date().toISOString()}] ${message}${suffix}\n`);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let auditSpoolRequiresAttention = false;

function asError(value) {
  return value instanceof Error ? value : new Error(String(value));
}

async function api(pathname, body = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Hooma-Audit-Protocol": auditProtocolVersion,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (value) {
    const error = asError(value);
    error.hoomaApiRetryable = true;
    throw error;
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    const error = new Error(result.message || `Hooma API returned HTTP ${response.status}`);
    error.hoomaApiStatus = response.status;
    error.hoomaApiResult = result;
    error.hoomaApiRetryable = [408, 409, 425, 429, 500, 502, 503, 504].includes(response.status);
    const retryAfterSeconds = Number(response.headers.get("retry-after"));
    error.hoomaApiRetryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(60_000, retryAfterSeconds * 1_000)
      : null;
    throw error;
  }
  return result;
}

function auditSpoolFilename(jobId, itemId) {
  if (!uuidPattern.test(jobId) || !uuidPattern.test(itemId)) throw new Error("Audit delivery identifiers are invalid.");
  return `${jobId}_${itemId}.json`;
}

function auditDeliveryPendingError(message, cause, quarantined = false) {
  const error = new Error(message, cause ? { cause: asError(cause) } : undefined);
  error.catalogAuditDeliveryPending = true;
  error.catalogAuditDeliveryQuarantined = quarantined;
  if (!quarantined) auditSpoolRequiresAttention = true;
  return error;
}

function nestedErrorCode(value) {
  let current = value;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current.code === "string") return current.code;
    current = current.cause;
  }
  return null;
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (value) {
    const code = nestedErrorCode(value);
    if (!["EACCES", "EBADF", "EISDIR", "EINVAL", "ENOSYS", "ENOTSUP", "EPERM"].includes(code)) throw value;
    log("Audit spool directory sync is unavailable on this platform", { directory, code });
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeDurableFile(filePath, contents) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(contents, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function parseAuditSpoolEntry(value, filePath) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Audit spool entry is invalid: ${filePath}`);
  const entry = value;
  if (
    entry.schema !== "hooma-audit-result-spool-v1"
    || !uuidPattern.test(String(entry.jobId ?? ""))
    || !uuidPattern.test(String(entry.itemId ?? ""))
    || !uuidPattern.test(String(entry.productId ?? ""))
    || !entry.payload
    || typeof entry.payload !== "object"
    || Array.isArray(entry.payload)
    || ((entry.payload.analysis ? 1 : 0) + (typeof entry.payload.error === "string" ? 1 : 0)) !== 1
  ) throw new Error(`Audit spool entry is invalid: ${filePath}`);
  return { ...entry, filePath };
}

async function readAuditSpoolFile(filePath) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (value) {
    const error = new Error(`Audit spool entry cannot be read: ${filePath}`, { cause: asError(value) });
    error.catalogAuditSpoolReadFailure = true;
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (value) {
    const error = new Error(`Audit spool entry contains invalid JSON: ${filePath}`, { cause: asError(value) });
    error.catalogAuditSpoolCorrupt = true;
    throw error;
  }
  try {
    return parseAuditSpoolEntry(parsed, filePath);
  } catch (value) {
    const error = asError(value);
    error.catalogAuditSpoolCorrupt = true;
    throw error;
  }
}

async function inspectAuditSpoolFile(filePath) {
  try {
    return { state: "valid", entry: await readAuditSpoolFile(filePath) };
  } catch (error) {
    if (nestedErrorCode(error) === "ENOENT") return { state: "missing", error };
    if (error?.catalogAuditSpoolCorrupt === true) return { state: "corrupt", error };
    return { state: "inaccessible", error };
  }
}

function sameAuditSpoolEntry(left, right) {
  return left.jobId === right.jobId
    && left.itemId === right.itemId
    && left.productId === right.productId
    && JSON.stringify(left.payload) === JSON.stringify(right.payload);
}

async function quarantineAuditSpoolFile(filePath, reason) {
  await mkdir(auditSpoolQuarantineDirectory, { recursive: true, mode: 0o700 });
  const safeReason = String(reason || "unknown").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48) || "unknown";
  const destination = path.join(
    auditSpoolQuarantineDirectory,
    `${Date.now()}_${randomUUID()}_${path.basename(filePath)}.${safeReason}.quarantine`,
  );
  try {
    await rename(filePath, destination);
  } catch (value) {
    if (nestedErrorCode(value) === "ENOENT") return null;
    throw value;
  }
  await syncDirectory(auditSpoolDirectory);
  await syncDirectory(auditSpoolQuarantineDirectory);
  log("Quarantined catalog audit spool entry", { file: path.basename(filePath), reason });
  return destination;
}

async function removeVerifiedDuplicateTemp(temporary) {
  try {
    await unlink(temporary);
    await syncDirectory(auditSpoolDirectory);
  } catch (value) {
    if (nestedErrorCode(value) !== "ENOENT") {
      throw auditDeliveryPendingError(
        `A verified duplicate audit spool temp file could not be removed: ${path.basename(temporary)}`,
        value,
      );
    }
  }
}

async function promoteAuditSpoolTemp(temporary, destination, entry) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // A same-directory hard link is an atomic no-clobber promotion on both
      // POSIX and Windows/NTFS. Unlike rename(), it can never overwrite a
      // different durable result that appeared after our inspection.
      await link(temporary, destination);
      await syncDirectory(auditSpoolDirectory);
      await removeVerifiedDuplicateTemp(temporary);
      return { ...entry, filePath: destination };
    } catch (value) {
      const code = nestedErrorCode(value);
      if (!["EEXIST", "EPERM"].includes(code)) {
        throw auditDeliveryPendingError(
          `Audit result is durable but its spool file is still pending promotion: ${path.basename(temporary)}`,
          value,
        );
      }

      const destinationState = await inspectAuditSpoolFile(destination);
      if (destinationState.state === "valid") {
        if (sameAuditSpoolEntry(destinationState.entry, entry)) {
          await removeVerifiedDuplicateTemp(temporary);
          return destinationState.entry;
        }
        let quarantinedPath;
        try {
          quarantinedPath = await quarantineAuditSpoolFile(temporary, "conflicting-result");
        } catch (quarantineError) {
          throw auditDeliveryPendingError(
            `Conflicting audit results exist and the temp result could not be quarantined: ${path.basename(temporary)}`,
            quarantineError,
          );
        }
        throw auditDeliveryPendingError(
          `Conflicting audit results require review in quarantine: ${path.basename(quarantinedPath || temporary)}`,
          value,
          true,
        );
      }
      if (destinationState.state === "corrupt") {
        try {
          await quarantineAuditSpoolFile(destination, "corrupt-destination");
        } catch (quarantineError) {
          throw auditDeliveryPendingError(
            `A corrupt audit spool destination could not be quarantined: ${path.basename(destination)}`,
            quarantineError,
          );
        }
        continue;
      }
      throw auditDeliveryPendingError(
        `Audit result is durable but its destination is unavailable: ${path.basename(destination)}`,
        destinationState.error || value,
      );
    }
  }
  throw auditDeliveryPendingError(`Audit spool promotion is pending: ${path.basename(temporary)}`);
}

async function writeAuditSpoolEntry(job, item, payload) {
  await mkdir(auditSpoolDirectory, { recursive: true, mode: 0o700 });
  const destination = path.join(auditSpoolDirectory, auditSpoolFilename(job.id, item.id));
  const entry = {
    schema: "hooma-audit-result-spool-v1",
    jobId: job.id,
    itemId: item.id,
    productId: item.productId,
    payload,
    createdAt: new Date().toISOString(),
  };
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeDurableFile(temporary, `${JSON.stringify(entry)}\n`);
  } catch (value) {
    throw auditDeliveryPendingError(
      `Audit result could not be durably written to its spool temp file: ${path.basename(temporary)}`,
      value,
    );
  }

  const destinationState = await inspectAuditSpoolFile(destination);
  if (destinationState.state === "valid") {
    if (sameAuditSpoolEntry(destinationState.entry, entry)) {
      await removeVerifiedDuplicateTemp(temporary);
      return destinationState.entry;
    }
    let quarantinedPath;
    try {
      quarantinedPath = await quarantineAuditSpoolFile(temporary, "conflicting-result");
    } catch (value) {
      throw auditDeliveryPendingError(
        `Conflicting audit results exist and the new result could not be quarantined: ${path.basename(temporary)}`,
        value,
      );
    }
    throw auditDeliveryPendingError(
      `Conflicting audit results require review in quarantine: ${path.basename(quarantinedPath || temporary)}`,
      null,
      true,
    );
  }
  if (destinationState.state === "corrupt") {
    try {
      await quarantineAuditSpoolFile(destination, "corrupt-destination");
    } catch (value) {
      throw auditDeliveryPendingError(
        `A corrupt audit spool destination could not be quarantined: ${path.basename(destination)}`,
        value,
      );
    }
  } else if (destinationState.state === "inaccessible") {
    throw auditDeliveryPendingError(
      `Audit result is durable but its spool destination cannot be inspected: ${path.basename(destination)}`,
      destinationState.error,
    );
  }

  return promoteAuditSpoolTemp(temporary, destination, entry);
}

async function recoverAuditSpoolTemps() {
  let filenames;
  try {
    filenames = await readdir(auditSpoolDirectory);
  } catch (value) {
    if (nestedErrorCode(value) === "ENOENT") return { recovered: 0, quarantined: 0, pending: 0 };
    throw value;
  }
  let recovered = 0;
  let quarantined = 0;
  let pending = 0;
  for (const filename of filenames.filter((name) => name.endsWith(".tmp")).sort()) {
    const temporary = path.join(auditSpoolDirectory, filename);
    const temporaryState = await inspectAuditSpoolFile(temporary);
    if (temporaryState.state === "missing") continue;
    if (temporaryState.state === "inaccessible") {
      pending += 1;
      log("Audit spool temp file is temporarily inaccessible", { file: filename });
      continue;
    }
    if (temporaryState.state === "corrupt") {
      try {
        if (await quarantineAuditSpoolFile(temporary, "corrupt-temp")) quarantined += 1;
      } catch (value) {
        pending += 1;
        log("Corrupt audit spool temp file could not be quarantined", { file: filename, error: asError(value).message });
      }
      continue;
    }

    const entry = temporaryState.entry;
    const destination = path.join(auditSpoolDirectory, auditSpoolFilename(entry.jobId, entry.itemId));
    const destinationState = await inspectAuditSpoolFile(destination);
    if (destinationState.state === "valid") {
      if (sameAuditSpoolEntry(destinationState.entry, entry)) {
        try {
          await removeVerifiedDuplicateTemp(temporary);
        } catch (value) {
          pending += 1;
          log("Duplicate audit spool temp file cleanup is pending", { file: filename, error: asError(value).message });
        }
      } else {
        try {
          if (await quarantineAuditSpoolFile(temporary, "conflicting-temp")) quarantined += 1;
        } catch (value) {
          pending += 1;
          log("Conflicting audit spool temp file could not be quarantined", { file: filename, error: asError(value).message });
        }
      }
      continue;
    }
    if (destinationState.state === "corrupt") {
      try {
        if (await quarantineAuditSpoolFile(destination, "corrupt-destination")) quarantined += 1;
      } catch (value) {
        pending += 1;
        log("Corrupt audit spool destination could not be quarantined", { file: path.basename(destination), error: asError(value).message });
        continue;
      }
    } else if (destinationState.state === "inaccessible") {
      pending += 1;
      log("Audit spool destination is temporarily inaccessible", { file: path.basename(destination) });
      continue;
    }

    try {
      await promoteAuditSpoolTemp(temporary, destination, entry);
      recovered += 1;
      log("Recovered durable catalog audit result from temp file", { productId: entry.productId });
    } catch (value) {
      pending += 1;
      log("Audit spool temp recovery is pending", { file: filename, error: asError(value).message });
    }
  }
  return { recovered, quarantined, pending };
}

async function listAuditSpoolEntries() {
  const recovery = await recoverAuditSpoolTemps();
  let filenames;
  try {
    filenames = await readdir(auditSpoolDirectory);
  } catch (value) {
    if (nestedErrorCode(value) === "ENOENT") return { entries: [], ...recovery };
    throw value;
  }
  const entries = [];
  let quarantined = recovery.quarantined;
  let pending = recovery.pending;
  for (const filename of filenames.filter((name) => name.endsWith(".json")).sort()) {
    const filePath = path.join(auditSpoolDirectory, filename);
    const fileState = await inspectAuditSpoolFile(filePath);
    if (fileState.state === "valid") {
      entries.push(fileState.entry);
      continue;
    }
    if (fileState.state === "missing") continue;
    if (fileState.state === "corrupt") {
      try {
        if (await quarantineAuditSpoolFile(filePath, "corrupt-entry")) quarantined += 1;
      } catch (value) {
        pending += 1;
        log("Corrupt audit spool entry could not be quarantined", { file: filename, error: asError(value).message });
      }
      continue;
    }
    pending += 1;
    log("Audit spool entry is temporarily inaccessible", { file: filename });
  }
  return { entries, recovered: recovery.recovered, quarantined, pending };
}

async function listAuditSpoolQuarantine() {
  try {
    const filenames = (await readdir(auditSpoolQuarantineDirectory))
      .filter((name) => name.endsWith(".quarantine"))
      .sort();
    const blockedDeliveryEntries = [];
    let inaccessibleBlockedDeliveries = 0;
    for (const filename of filenames) {
      const filePath = path.join(auditSpoolQuarantineDirectory, filename);
      try {
        const entry = await readAuditSpoolFile(filePath);
        if (filename.includes(".http-")) blockedDeliveryEntries.push(entry);
      } catch (value) {
        if (
          filename.includes(".http-")
          && value?.catalogAuditSpoolCorrupt !== true
          && nestedErrorCode(value) !== "ENOENT"
        ) inaccessibleBlockedDeliveries += 1;
        // Corrupt evidence remains quarantined for manual inspection, but only
        // a valid HTTP-rejected delivery can be safely replayed automatically.
      }
    }
    return { count: filenames.length, blockedDeliveryEntries, inaccessibleBlockedDeliveries };
  } catch (value) {
    if (nestedErrorCode(value) === "ENOENT") {
      return { count: 0, blockedDeliveryEntries: [], inaccessibleBlockedDeliveries: 0 };
    }
    throw value;
  }
}

async function recoverQuarantinedDeliveries() {
  const quarantine = await listAuditSpoolQuarantine();
  let recovered = 0;
  let pending = 0;
  for (const entry of quarantine.blockedDeliveryEntries) {
    let result;
    try {
      result = await api(`/api/catalog-agent/audits/${entry.jobId}/items/${entry.itemId}/review`, entry.payload);
    } catch (value) {
      const error = asError(value);
      pending += 1;
      log("Quarantined audit delivery still blocks new audit claims", {
        productId: entry.productId,
        retryable: error.hoomaApiRetryable === true,
        error: error.message,
      });
      if (error.hoomaApiRetryable !== true) {
        await api(`/api/catalog-agent/audits/${entry.jobId}/complete`, {
          status: "failed",
          error: "A catalog audit result was permanently rejected during delivery",
        }).catch((completionError) => {
          log("Quarantined delivery job terminalization is pending", {
            job: entry.jobId,
            error: asError(completionError).message,
          });
        });
      }
      continue;
    }

    // Hooma has already accepted this exact result. A local cleanup error
    // must never be reclassified as an API rejection or fail the job; leaving
    // the file simply causes another harmless idempotent delivery attempt.
    try {
      await unlink(entry.filePath).catch((value) => {
        if (nestedErrorCode(value) !== "ENOENT") throw value;
      });
      await syncDirectory(auditSpoolQuarantineDirectory);
      recovered += 1;
      log("Recovered quarantined catalog audit delivery", {
        productId: entry.productId,
        status: result.status,
      });
    } catch (value) {
      pending += 1;
      log("Accepted quarantined delivery cleanup is pending", {
        productId: entry.productId,
        error: asError(value).message,
      });
    }
  }
  const remaining = await listAuditSpoolQuarantine();
  return {
    recovered,
    pending: pending + remaining.inaccessibleBlockedDeliveries,
    quarantined: remaining.count,
    blockingDeliveries: remaining.blockedDeliveryEntries.length + remaining.inaccessibleBlockedDeliveries,
  };
}

async function deliverAuditSpoolEntry(entry) {
  let lastError = null;
  let result = null;
  for (let attempt = 1; attempt <= auditDeliveryAttempts; attempt += 1) {
    try {
      result = await api(`/api/catalog-agent/audits/${entry.jobId}/items/${entry.itemId}/review`, entry.payload);
      break;
    } catch (value) {
      lastError = asError(value);
      if (lastError.hoomaApiRetryable !== true) {
        let quarantinedPath;
        try {
          quarantinedPath = await quarantineAuditSpoolFile(entry.filePath, `http-${lastError.hoomaApiStatus || "permanent"}`);
        } catch (quarantineError) {
          throw auditDeliveryPendingError(
            `Audit delivery failed permanently and its spool entry could not be quarantined: ${lastError.message}`,
            quarantineError,
          );
        }
        const permanentError = auditDeliveryPendingError(
          `Audit delivery failed permanently; the result requires review in quarantine: ${path.basename(quarantinedPath || entry.filePath)}`,
          lastError,
          true,
        );
        // A valid worker result rejected permanently by Hooma indicates an auth
        // or worker/API contract problem. Stop the job so the same mismatch
        // cannot consume the catalog.
        permanentError.catalogAuditJobFatal = true;
        throw permanentError;
      }
      if (attempt === auditDeliveryAttempts) break;
      const delayMs = lastError.hoomaApiRetryAfterMs ?? Math.min(30_000, 2 ** (attempt - 1) * 1_000);
      log("Audit result delivery retry", {
        productId: entry.productId,
        attempt,
        nextAttemptInSeconds: Math.ceil(delayMs / 1_000),
        error: lastError.message,
      });
      await wait(delayMs);
    }
  }
  if (!result) {
    throw auditDeliveryPendingError(
      `Audit result is safely spooled but delivery is pending: ${lastError?.message || "unknown API error"}`,
      lastError,
    );
  }
  try {
    await unlink(entry.filePath);
  } catch (value) {
    if (nestedErrorCode(value) !== "ENOENT") {
      throw auditDeliveryPendingError(
        `Audit result was accepted but its spool entry could not be removed: ${path.basename(entry.filePath)}`,
        value,
      );
    }
  }
  return result;
}

async function flushAuditSpool() {
  const listing = await listAuditSpoolEntries();
  let delivered = 0;
  let pending = listing.pending;
  for (const entry of listing.entries) {
    try {
      const result = await deliverAuditSpoolEntry(entry);
      delivered += 1;
      log("Delivered spooled catalog audit result", {
        productId: entry.productId,
        status: result.status,
        resultType: entry.payload.analysis ? "analysis" : "failure",
      });
    } catch (value) {
      const error = asError(value);
      if (error.catalogAuditDeliveryPending !== true) throw error;
      if (error.catalogAuditDeliveryQuarantined !== true) pending += 1;
      log(error.catalogAuditDeliveryQuarantined === true
        ? "Catalog audit result moved to quarantine"
        : "Catalog audit result remains pending", {
        productId: entry.productId,
        quarantined: error.catalogAuditDeliveryQuarantined === true,
        error: error.message,
      });
    }
  }
  const quarantine = await recoverQuarantinedDeliveries();
  const quarantined = quarantine.quarantined;
  const blockAuditClaims = pending > 0 || quarantine.blockingDeliveries > 0;
  auditSpoolRequiresAttention = blockAuditClaims;
  return {
    delivered,
    recovered: listing.recovered + quarantine.recovered,
    pending: pending + quarantine.pending,
    quarantined,
    blockingQuarantinedDeliveries: quarantine.blockingDeliveries,
    blockAuditClaims,
  };
}

async function assertPageAvailable(page) {
  const snapshot = `${await page.title().catch(() => "")} ${await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "")}`.slice(0, 20_000);
  if (/captcha|verify you are human|checking your browser|access denied|unusual traffic|robot verification/i.test(snapshot)) {
    throw new Error("Source requested human verification. Open the worker browser and complete it, then rerun the job.");
  }
}

async function discoverMakerWorld(page, job) {
  await page.goto(job.source_url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await assertPageAvailable(page);
  const known = new Set();
  let idleRounds = 0;
  let limitReached = false;

  for (let round = 0; round < 400 && known.size < job.max_products && idleRounds < 8; round += 1) {
    const candidates = await page.locator('a[href*="/models/"]').evaluateAll((links) => links.map((link) => ({
      sourceUrl: link.href,
      sourceTitle: (link.getAttribute("title") || link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240) || null,
      sourceModelId: link.href.match(/\/models\/(\d+)/i)?.[1] ?? null,
    })));
    const fresh = [];
    for (const candidate of candidates) {
      if (!candidate.sourceUrl || known.has(candidate.sourceUrl)) continue;
      known.add(candidate.sourceUrl);
      fresh.push(candidate);
      if (known.size >= job.max_products) break;
    }
    if (fresh.length) {
      idleRounds = 0;
      for (let offset = 0; offset < fresh.length; offset += 100) {
        const response = await api(`/api/catalog-agent/jobs/${job.id}/discover`, {
          items: fresh.slice(offset, offset + 100),
          cursor: { discoveryRound: round, discoveredInBrowser: known.size, pageUrl: page.url() },
        });
        limitReached ||= Boolean(response.limitReached);
      }
      log("Discovered category products", { job: job.id, total: known.size });
    } else {
      idleRounds += 1;
    }
    if (limitReached || known.size >= job.max_products) break;

    const beforeHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(1_500);
    const afterHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    if (afterHeight <= beforeHeight && !fresh.length) {
      const next = page.locator('a[rel="next"], button[aria-label*="next" i], button:has-text("Next"), button:has-text("შემდეგი")').first();
      if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) {
        await next.click();
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(1_500);
      }
    }
    if (round % 10 === 0) await assertPageAvailable(page);
  }
  return known.size;
}

async function discoverGeneric(page, job) {
  await page.goto(job.source_url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await assertPageAvailable(page);
  const sourceHost = new URL(job.source_url).hostname;
  const candidates = await page.locator("a[href]").evaluateAll((links, host) => links.map((link) => ({
    sourceUrl: link.href,
    sourceTitle: (link.getAttribute("title") || link.textContent || "").replace(/\s+/g, " ").trim().slice(0, 240) || null,
  })).filter((item) => {
    try {
      const url = new URL(item.sourceUrl);
      return url.hostname === host && /\/(?:models?|thing|3d-model)[_/-]/i.test(url.pathname);
    } catch { return false; }
  }), sourceHost);
  for (let offset = 0; offset < candidates.length && offset < job.max_products; offset += 100) {
    await api(`/api/catalog-agent/jobs/${job.id}/discover`, { items: candidates.slice(offset, Math.min(offset + 100, job.max_products)) });
  }
  return Math.min(candidates.length, job.max_products);
}

async function extractItem(page, item) {
  await page.goto(item.source_url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await assertPageAvailable(page);
  const payload = await page.evaluate(extractorSource);
  if (!payload || payload.schema !== "hooma-catalog-clipper-v1") throw new Error("Clipper extractor returned an invalid payload.");
  return payload;
}

async function processJob(context, job) {
  const page = context.pages()[0] ?? await context.newPage();
  log("Started category job", { id: job.id, platform: job.source_platform, category: job.category_label, limit: job.max_products });
  if (Number(job.discovered_count ?? 0) === 0) {
    const discovered = job.source_platform === "makerworld"
      ? await discoverMakerWorld(page, job)
      : await discoverGeneric(page, job);
    log("Category discovery finished", { job: job.id, discovered });
  } else {
    log("Resuming previously discovered category", { job: job.id, discovered: job.discovered_count });
  }

  while (!stopping) {
    const claim = await api(`/api/catalog-agent/jobs/${job.id}/items/claim`);
    if (!claim.item) break;
    const item = claim.item;
    try {
      const payload = await extractItem(page, item);
      const result = await api(`/api/catalog-agent/jobs/${job.id}/items/${item.id}/draft`, { payload });
      log("Processed product", { source: item.source_url, status: result.status, productId: result.productId ?? null });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await api(`/api/catalog-agent/jobs/${job.id}/items/${item.id}/draft`, { error: message }).catch(() => {});
      log("Product extraction failed", { source: item.source_url, error: message });
    }
  }
  if (stopping) {
    log("Category job paused for worker shutdown", { id: job.id });
    return;
  }
  const completion = await api(`/api/catalog-agent/jobs/${job.id}/complete`, { status: "completed" });
  log("Category job completed", completion.counters);
}

async function claimAuditItem(jobId) {
  if (auditSpoolRequiresAttention) {
    throw auditDeliveryPendingError("Pending or quarantined audit results must be resolved before claiming another product.");
  }
  let skipped = 0;
  while (!stopping) {
    const claim = await api(`/api/catalog-agent/audits/${jobId}/items/claim`);
    if (claim.item || !claim.continueClaiming) return claim.item ?? null;
    skipped += 1;
    if (skipped % 100 === 0) log("Skipped products without auditable media or active variants", { job: jobId, skipped });
  }
  return null;
}

async function processAuditItem(job, item) {
  let analysis;
  try {
    analysis = await auditProduct(item.product);
  } catch (value) {
    const error = asError(value);
    const message = String(error.message || "Product audit failed").replace(/\s+/g, " ").trim().slice(0, 500);
    const failureEntry = await writeAuditSpoolEntry(job, item, { error: message || "Product audit failed" });
    const failureResult = await deliverAuditSpoolEntry(failureEntry);
    log("Catalog product audit failed", { productId: item.productId, status: failureResult.status, error: message });
    if (failureResult.status !== "failed") return { auditFailed: false };
    if (error?.catalogAuditFatal === true) throw error;
    return { auditFailed: true };
  }

  // Persist the paid model result before the first delivery attempt. If the
  // API response is lost or the worker restarts, this exact payload is replayed
  // instead of invoking OpenAI for the same item again.
  const resultEntry = await writeAuditSpoolEntry(job, item, { analysis });
  const result = await deliverAuditSpoolEntry(resultEntry);
  log("Audited catalog product", {
    productId: item.productId,
    status: result.status,
    confidence: analysis.dimensionConfidence,
    keptImages: analysis.imageDecisions.filter((decision) => decision.keep).length,
    removedImages: analysis.imageDecisions.filter((decision) => !decision.keep).length,
  });
  return { auditFailed: false };
}

async function processAuditJob(job) {
  log("Started catalog product audit", {
    id: job.id,
    products: job.total_count,
    statuses: job.product_statuses,
    concurrency: auditConcurrency,
  });
  let consecutiveModelFailures = 0;
  while (!stopping) {
    const items = [];
    for (let slot = 0; slot < auditConcurrency && !stopping; slot += 1) {
      const item = await claimAuditItem(job.id);
      if (!item) break;
      items.push(item);
    }
    if (!items.length) break;
    const results = await Promise.allSettled(items.map((item) => processAuditItem(job, item)));
    const rejected = results.filter((result) => result.status === "rejected");
    const failed = rejected.find((result) => result.reason?.catalogAuditDeliveryPending === true) ?? rejected[0];
    if (failed?.status === "rejected") throw failed.reason;
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      if (result.value?.auditFailed === true) consecutiveModelFailures += 1;
      else consecutiveModelFailures = 0;
      if (consecutiveModelFailures >= 3) {
        const error = new Error("Catalog audit stopped after 3 consecutive model-output failures; verify the model and schema before restarting.");
        error.catalogAuditFailureThreshold = true;
        throw error;
      }
    }
    if (auditDelayMs) await wait(auditDelayMs);
  }
  if (stopping) {
    log("Catalog product audit paused for worker shutdown", { id: job.id });
    return;
  }
  try {
    const completion = await api(`/api/catalog-agent/audits/${job.id}/complete`, { status: "completed" });
    log("Catalog product audit completed", completion.counters);
  } catch (value) {
    const error = asError(value);
    if (
      error.hoomaApiStatus === 409
      && Number(error.hoomaApiResult?.counters?.processing_count ?? 0) > 0
    ) {
      error.catalogAuditSealedAttemptsPending = true;
      throw error;
    }
    throw error;
  }
}

const launchOptions = {
  headless,
  locale: "ka-GE",
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: false,
  ...(channel ? { channel } : {}),
};
let context = null;
if (workerMode !== "audit") {
  const { chromium } = await import("playwright");
  context = await chromium.launchPersistentContext(profilePath, launchOptions);
}
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });

log("Hooma Catalog Agent is online", {
  baseUrl,
  workerName,
  mode: workerMode,
  browser: context ? { headless, channel: channel || "chromium" } : "disabled",
  auditConfigured,
  auditConcurrency,
  auditProtocolVersion,
});
if (!auditConfigured && workerMode === "all") log("Product audits are disabled until OPENAI_API_KEY is added to .env");
while (!stopping) {
  let activeJob = null;
  let activeJobKind = null;
  let auditDeliveryState = {
    delivered: 0,
    recovered: 0,
    pending: auditSpoolRequiresAttention ? 1 : 0,
    quarantined: 0,
    blockAuditClaims: auditSpoolRequiresAttention,
  };
  try {
    if (workerMode !== "audit") {
      const claim = await api("/api/catalog-agent/jobs/claim", { workerName });
      activeJob = claim.job;
      activeJobKind = activeJob ? "import" : null;
      if (activeJob) await processJob(context, activeJob);
    }

    if (workerMode !== "import") {
      try {
        auditDeliveryState = await flushAuditSpool();
      } catch (value) {
        const spoolError = asError(value);
        auditSpoolRequiresAttention = true;
        auditDeliveryState = { ...auditDeliveryState, pending: Math.max(1, auditDeliveryState.pending), blockAuditClaims: true };
        log("Audit spool maintenance failed; new audit claims are paused", spoolError.message);
      }
    }

    if (!activeJob && workerMode !== "import" && auditConfigured) {
      if (auditDeliveryState.blockAuditClaims) {
        log("New catalog audit claims are paused until pending spool results are resolved", {
          pending: auditDeliveryState.pending,
          quarantined: auditDeliveryState.quarantined,
        });
      } else {
        const claim = await api("/api/catalog-agent/audits/claim", { workerName });
        activeJob = claim.job;
        activeJobKind = activeJob ? "audit" : null;
        if (activeJob) await processAuditJob(activeJob);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("Worker cycle failed", message);
    if (activeJob?.id && activeJobKind === "import") {
      await api(`/api/catalog-agent/jobs/${activeJob.id}/complete`, { status: "failed", error: message }).catch(() => {});
    }
    if (
      activeJob?.id
      && activeJobKind === "audit"
      && (error?.catalogAuditDeliveryPending !== true || error?.catalogAuditJobFatal === true)
      && error?.catalogAuditSealedAttemptsPending !== true
    ) {
      await api(`/api/catalog-agent/audits/${activeJob.id}/complete`, { status: "failed", error: message }).catch(() => {});
    }
  }
  if (!stopping) await wait(pollSeconds * 1_000);
}
if (context) await context.close();
log("Hooma Catalog Agent stopped");
