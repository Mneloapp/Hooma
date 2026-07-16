import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

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

if (!/^https:\/\//i.test(baseUrl)) throw new Error("HOOMA_BASE_URL must be an HTTPS URL.");
if (!/^hooma_ca_[a-f0-9]{12}_[A-Za-z0-9_-]{40,100}$/.test(token)) throw new Error("HOOMA_AGENT_TOKEN is missing or invalid.");

const log = (message, details) => {
  const suffix = details === undefined ? "" : ` ${typeof details === "string" ? details : JSON.stringify(details)}`;
  process.stdout.write(`[${new Date().toISOString()}] ${message}${suffix}\n`);
};
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function api(pathname, body = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.message || `Hooma API returned HTTP ${response.status}`);
  return result;
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

  while (true) {
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
  const completion = await api(`/api/catalog-agent/jobs/${job.id}/complete`, { status: "completed" });
  log("Category job completed", completion.counters);
}

const launchOptions = {
  headless,
  locale: "ka-GE",
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: false,
  ...(channel ? { channel } : {}),
};
const context = await chromium.launchPersistentContext(profilePath, launchOptions);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopping = true; });

log("Hooma Catalog Agent is online", { baseUrl, workerName, headless, channel: channel || "chromium" });
while (!stopping) {
  let job = null;
  try {
    const claim = await api("/api/catalog-agent/jobs/claim", { workerName });
    job = claim.job;
    if (job) await processJob(context, job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("Worker cycle failed", message);
    if (job?.id) await api(`/api/catalog-agent/jobs/${job.id}/complete`, { status: "failed", error: message }).catch(() => {});
  }
  if (!stopping) await wait(pollSeconds * 1_000);
}
await context.close();
log("Hooma Catalog Agent stopped");

