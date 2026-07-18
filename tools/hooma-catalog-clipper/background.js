const HOOMA_BASE_URL = "https://www.hooma.ge";
const AGENT_TOKEN_PATTERN = /^hooma_ca_[a-f0-9]{12}_[A-Za-z0-9_-]{48}$/;
const STATE_KEY = "hoomaAutoQueueState";
const TOKEN_KEY = "hoomaAssistedToken";
const HISTORY_KEY = "hoomaAutoProcessedSources";
const WAKE_ALARM = "hooma-auto-queue-wake";
const VERIFICATION_NOTIFICATION = "hooma-auto-queue-verification";
const WORKER_NAME = "Hooma Clipper Auto Queue V2 · Chrome";
const MAX_HISTORY = 25_000;

const defaultState = () => ({
  enabled: false,
  paused: false,
  phase: "idle",
  resumePhase: null,
  job: null,
  item: null,
  tabId: null,
  processedCount: 0,
  draftCount: 0,
  reviewCount: 0,
  duplicateCount: 0,
  failedCount: 0,
  skippedDuplicates: 0,
  discoveryPass: 0,
  retryCount: 0,
  message: "Auto Queue მზადაა.",
  lastError: null,
  startedAt: null,
  updatedAt: new Date().toISOString(),
});

let state = defaultState();
let running = false;
let wakeTimer = null;

class AgentApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AgentApiError";
    this.status = status;
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function broadcastState() {
  try {
    chrome.runtime.sendMessage({ type: "AUTO_QUEUE_STATE_CHANGED", state }, () => void chrome.runtime.lastError);
  } catch { /* The popup is usually closed while the worker runs. */ }
}

async function saveState(patch = {}) {
  state = { ...state, ...patch, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [STATE_KEY]: state });
  await updateActionBadge();
  broadcastState();
  return state;
}

async function loadState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  state = stored[STATE_KEY] && typeof stored[STATE_KEY] === "object"
    ? { ...defaultState(), ...stored[STATE_KEY] }
    : defaultState();
  return state;
}

async function updateActionBadge() {
  if (state.phase === "waiting_verification") {
    await chrome.action.setBadgeBackgroundColor({ color: "#C2410C" });
    await chrome.action.setBadgeText({ text: "!" });
    return;
  }
  if (state.enabled && !state.paused) {
    await chrome.action.setBadgeBackgroundColor({ color: "#17653A" });
    await chrome.action.setBadgeText({ text: "ON" });
    return;
  }
  if (state.paused) {
    await chrome.action.setBadgeBackgroundColor({ color: "#6B7280" });
    await chrome.action.setBadgeText({ text: "Ⅱ" });
    return;
  }
  await chrome.action.setBadgeText({ text: "" });
}

function schedule(delayMs = 1_000) {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    runCycle();
  }, Math.max(100, delayMs));
  chrome.alarms.create(WAKE_ALARM, { when: Date.now() + Math.max(1_000, delayMs) });
}

async function agentToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  const token = typeof stored[TOKEN_KEY] === "string" ? stored[TOKEN_KEY].trim() : "";
  if (!AGENT_TOKEN_PATTERN.test(token)) {
    throw new AgentApiError("ჯერ შეინახე Auto Queue Agent-ის სწორი token.", 401);
  }
  return token;
}

async function agentApi(pathname, body = {}) {
  const token = await agentToken();
  const response = await fetch(`${HOOMA_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new AgentApiError(result.message || `Hooma API returned HTTP ${response.status}`, response.status);
  }
  return result;
}

function normalizedCatalogUrl(value) {
  const url = new URL(String(value));
  url.hash = "";
  ["from", "ref", "source", "spm_id_from"].forEach((key) => url.searchParams.delete(key));
  Array.from(url.searchParams.keys()).forEach((key) => {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  });
  return url.toString();
}

function sourceIdentity(sourceUrl, sourceModelId = null, platform = "other") {
  const modelId = typeof sourceModelId === "string" ? sourceModelId.trim() : "";
  return modelId ? `${platform}:model:${modelId}` : `${platform}:url:${normalizedCatalogUrl(sourceUrl)}`;
}

async function processedHistory() {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY].filter((value) => typeof value === "string") : [];
}

async function rememberProcessed(item, platform) {
  if (!item?.source_url) return;
  const identity = sourceIdentity(item.source_url, item.source_model_id, platform);
  const history = await processedHistory();
  const next = [identity, ...history.filter((value) => value !== identity)].slice(0, MAX_HISTORY);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
}

async function managedTab() {
  if (Number.isInteger(state.tabId)) {
    try {
      return await chrome.tabs.get(state.tabId);
    } catch { /* The operator may have closed the managed tab. */ }
  }
  const tab = await chrome.tabs.create({ url: "about:blank", active: true, pinned: true });
  await saveState({ tabId: tab.id ?? null });
  return tab;
}

async function navigateAndWait(targetUrl, nextPhase, message) {
  const tab = await managedTab();
  const currentUrl = /^https?:/i.test(tab.url ?? "") ? normalizedCatalogUrl(tab.url) : "";
  const normalizedTarget = normalizedCatalogUrl(targetUrl);
  if (currentUrl !== normalizedTarget) {
    await saveState({ message, retryCount: 0 });
    await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
    schedule(4_000);
    return false;
  }
  if (tab.status !== "complete") {
    schedule(2_000);
    return false;
  }
  await saveState({ phase: nextPhase, message, retryCount: 0 });
  schedule(nextPhase === "extract_item" ? 2_500 : 1_000);
  return true;
}

async function pageSnapshot(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      snapshot: `${document.title} ${document.body?.innerText || ""}`.slice(0, 30_000),
      ready: document.readyState === "complete" && Boolean(document.body),
    }),
  });
  return results?.[0]?.result ?? { snapshot: "", ready: false };
}

function snapshotRequestsVerification(snapshot) {
  return /performing security verification|verify you are (?:a )?human|verify you are not a bot|checking your browser|captcha|access denied|unusual traffic|robot verification/i.test(snapshot);
}

async function verificationRequired(tabId) {
  const page = await pageSnapshot(tabId);
  return snapshotRequestsVerification(page.snapshot);
}

async function pauseForVerification(resumePhase) {
  const tab = await managedTab();
  await saveState({
    paused: true,
    phase: "waiting_verification",
    resumePhase,
    message: "გვერდი ითხოვს human verification-ს. დაასრულე შემოწმება გახსნილ ჩანართში და დააჭირე გაგრძელებას.",
    lastError: null,
  });
  await chrome.tabs.update(tab.id, { active: true });
  if (Number.isInteger(tab.windowId)) await chrome.windows.update(tab.windowId, { focused: true });
  try {
    await chrome.notifications.create(VERIFICATION_NOTIFICATION, {
      type: "basic",
      iconUrl: `${HOOMA_BASE_URL}/brand/hooma-symbol.png`,
      title: "Hooma Auto Queue შეჩერდა",
      message: "MakerWorld ითხოვს human verification-ს. დაასრულე ხელით და Clipper-ში დააჭირე „გაგრძელება“.",
      priority: 2,
      requireInteraction: true,
    });
  } catch { /* Badge and persisted state still expose the verification pause. */ }
}

async function discoverCategory(tabId, expectedHost, maximumProducts) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (host, maximum) => {
      const verificationPattern = /performing security verification|verify you are (?:a )?human|verify you are not a bot|checking your browser|captcha|access denied|unusual traffic|robot verification/i;
      const pageText = () => `${document.title} ${document.body?.innerText || ""}`.slice(0, 30_000);
      if (verificationPattern.test(pageText())) return { verification: true, items: [] };

      const acceptedHost = (candidate) => candidate === host || candidate.endsWith(`.${host}`) || host.endsWith(`.${candidate}`);
      const productPath = /(?:\/models\/\d+|\/model\/\d+|\/thing:\d+|\/3d-model\/|\/object\/3d-print-)/i;
      const discovered = new Map();
      const normalize = (value) => {
        const url = new URL(value, location.href);
        if (url.protocol !== "https:" || !acceptedHost(url.hostname.toLowerCase()) || !productPath.test(url.pathname)) return null;
        url.hash = "";
        for (const key of ["from", "ref", "source", "spm_id_from"]) url.searchParams.delete(key);
        for (const key of Array.from(url.searchParams.keys())) {
          if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
        }
        return url;
      };
      const collect = () => {
        for (const link of document.querySelectorAll("a[href]")) {
          try {
            const url = normalize(link.href);
            if (!url) continue;
            const sourceUrl = url.toString();
            const sourceModelId = url.pathname.match(/\/models?\/(\d+)/i)?.[1]
              ?? url.pathname.match(/\/thing:(\d+)/i)?.[1]
              ?? null;
            const sourceTitle = (link.getAttribute("title") || link.getAttribute("aria-label") || link.textContent || "")
              .replace(/\s+/g, " ").trim().slice(0, 240) || null;
            if (!discovered.has(sourceUrl)) discovered.set(sourceUrl, { sourceUrl, sourceTitle, sourceModelId });
          } catch { /* Ignore malformed links. */ }
        }
      };

      let unchangedRounds = 0;
      let previousSize = -1;
      for (let round = 0; round < 12 && discovered.size < maximum; round += 1) {
        collect();
        if (verificationPattern.test(pageText())) return { verification: true, items: [] };
        unchangedRounds = discovered.size === previousSize ? unchangedRounds + 1 : 0;
        previousSize = discovered.size;
        const nearBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 180;
        if (nearBottom && unchangedRounds >= 5) break;
        window.scrollBy({ top: Math.max(700, Math.floor(innerHeight * 0.85)), behavior: "auto" });
        await new Promise((resolve) => setTimeout(resolve, 1_100));
      }
      collect();
      const nearBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 180;
      return {
        verification: false,
        complete: discovered.size >= maximum || (nearBottom && unchangedRounds >= 3),
        items: Array.from(discovered.values()).slice(0, maximum),
      };
    },
    args: [expectedHost, Math.max(1, Math.min(2_000, Number(maximumProducts) || 500))],
  });
  return results?.[0]?.result ?? { verification: false, complete: false, items: [] };
}

async function submitDiscoveredItems(job, items, pageUrl) {
  const history = new Set(await processedHistory());
  const freshItems = items.filter((item) => !history.has(sourceIdentity(item.sourceUrl, item.sourceModelId, job.source_platform)));
  let accepted = 0;
  let skippedDuplicates = items.length - freshItems.length;
  let alreadyInJob = 0;
  let limitReached = false;
  for (let offset = 0; offset < freshItems.length; offset += 100) {
    const chunk = freshItems.slice(offset, offset + 100);
    const result = await agentApi(`/api/catalog-agent/jobs/${job.id}/discover`, {
      items: chunk,
      cursor: {
        mode: "clipper_auto_queue_v2",
        capturedAt: new Date().toISOString(),
        pageUrl,
        discovered: items.length,
      },
    });
    accepted += Number(result.accepted ?? 0);
    skippedDuplicates += Number(result.skippedDuplicates ?? 0);
    alreadyInJob += Number(result.alreadyInJob ?? 0);
    limitReached ||= Boolean(result.limitReached);
    if (limitReached) break;
  }
  return { accepted, skippedDuplicates, alreadyInJob, limitReached };
}

async function extractProduct(tabId) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, files: ["extractor.js"] });
  const payload = results?.[0]?.result;
  if (!payload?.product || payload.schema !== "hooma-catalog-clipper-v1") {
    throw new Error("გვერდიდან პროდუქტის მონაცემები ვერ მომზადდა.");
  }
  return payload;
}

async function processClaimJob() {
  await saveState({ message: "Hooma-ს რიგში დავალება იძებნება…", lastError: null });
  const result = await agentApi("/api/catalog-agent/jobs/claim", { workerName: WORKER_NAME });
  if (!result.job) {
    await saveState({ phase: "waiting_queue", message: "რიგში ახალი დავალება ჯერ არ არის. Auto Queue ისევ შეამოწმებს.", retryCount: 0 });
    schedule(30_000);
    return;
  }
  const host = new URL(result.job.source_url).hostname.toLowerCase();
  await saveState({
    job: result.job,
    item: null,
    phase: "navigate_category",
    message: `დავალება მიღებულია: ${result.job.category_label}. კატეგორია იხსნება…`,
    retryCount: 0,
    lastError: null,
    discoveryPass: 0,
  });
  if (!/(^|\.)makerworld\.com$/i.test(host)) {
    await saveState({
      paused: true,
      resumePhase: "navigate_category",
      message: "Auto Queue V2 ამ ეტაპზე MakerWorld-ის დავალებებს ემსახურება. სხვა წყაროსთვის გამოიყენე Manual Mode.",
      lastError: `Unsupported Auto Queue host: ${host}`,
    });
    return;
  }
  schedule(500);
}

async function processCategoryDiscovery() {
  const tab = await managedTab();
  if (await verificationRequired(tab.id)) {
    await pauseForVerification("discover_category");
    return;
  }
  await saveState({ message: "კატეგორია იკითხება და პროდუქტების რიგი ავტომატურად ივსება…" });
  const host = new URL(state.job.source_url).hostname.toLowerCase();
  const result = await discoverCategory(tab.id, host, state.job.max_products);
  if (result.verification) {
    await pauseForVerification("discover_category");
    return;
  }
  if (state.paused || !state.enabled) return;
  const submission = result.items.length
    ? await submitDiscoveredItems(state.job, result.items, tab.url)
    : { accepted: 0, skippedDuplicates: 0, alreadyInJob: 0, limitReached: false };
  const discoveryPass = state.discoveryPass + 1;
  const discoveryFinished = Boolean(result.complete || submission.limitReached || discoveryPass >= 100);
  await saveState({
    phase: discoveryFinished ? "claim_item" : "discover_category",
    discoveryPass,
    skippedDuplicates: state.skippedDuplicates + submission.skippedDuplicates + submission.alreadyInJob,
    message: `${submission.accepted} ახალი პროდუქტი დაემატა რიგში; ${submission.skippedDuplicates + submission.alreadyInJob} დუბლიკატი გამოტოვებულია.${discoveryFinished ? " პროდუქტების რიგი მზადაა." : " კატეგორიის ქვედა ნაწილი იკითხება…"}`,
    retryCount: 0,
  });
  schedule(discoveryFinished ? 1_000 : 1_500);
}

async function processClaimItem() {
  const result = await agentApi(`/api/catalog-agent/jobs/${state.job.id}/items/claim`);
  const skipped = Number(result.skippedDuplicates ?? 0);
  if (!result.item && result.continueClaiming) {
    await saveState({
      phase: "claim_item",
      skippedDuplicates: state.skippedDuplicates + skipped,
      message: `${skipped} უკვე დამუშავებული პროდუქტი გვერდის გახსნის გარეშე გამოტოვებულია. შემოწმება გრძელდება…`,
      retryCount: 0,
    });
    schedule(1_000);
    return;
  }
  if (!result.item) {
    await saveState({
      phase: "complete_job",
      skippedDuplicates: state.skippedDuplicates + skipped,
      message: "დავალების ყველა ახალი პროდუქტი დამუშავებულია. დავალება სრულდება…",
      retryCount: 0,
    });
    schedule(700);
    return;
  }
  await saveState({
    item: result.item,
    phase: "navigate_item",
    skippedDuplicates: state.skippedDuplicates + skipped,
    message: `პროდუქტი იხსნება: ${result.item.source_title || result.item.source_url}`,
    retryCount: 0,
  });
  schedule(700);
}

async function processProductExtraction() {
  const tab = await managedTab();
  if (await verificationRequired(tab.id)) {
    await pauseForVerification("extract_item");
    return;
  }
  await saveState({ message: `მონაცემები იკითხება: ${state.item.source_title || state.item.source_url}` });
  let payload;
  try {
    payload = await extractProduct(tab.id);
  } catch (error) {
    await agentApi(`/api/catalog-agent/jobs/${state.job.id}/items/${state.item.id}/draft`, {
      error: error instanceof Error ? error.message : "Product extraction failed",
    });
    await saveState({
      item: null,
      phase: "claim_item",
      processedCount: state.processedCount + 1,
      failedCount: state.failedCount + 1,
      message: "პროდუქტი ვერ წაიკითხა და Failed სტატუსით გამოტოვა. რიგი გრძელდება.",
      retryCount: 0,
    });
    schedule(5_000);
    return;
  }
  if (state.paused || !state.enabled) return;
  const completedItem = state.item;
  const result = await agentApi(`/api/catalog-agent/jobs/${state.job.id}/items/${completedItem.id}/draft`, { payload });
  await rememberProcessed(completedItem, state.job.source_platform);
  const status = result.status;
  await saveState({
    item: null,
    phase: "claim_item",
    processedCount: state.processedCount + 1,
    draftCount: state.draftCount + (status === "draft_created" ? 1 : 0),
    reviewCount: state.reviewCount + (status === "needs_review" ? 1 : 0),
    duplicateCount: state.duplicateCount + (status === "duplicate" ? 1 : 0),
    message: status === "duplicate"
      ? "პროდუქტი უკვე არსებობდა — მეორედ აღარ გადმოტანილა."
      : status === "needs_review"
        ? "პროდუქტის მონაცემები გადასახედად შეინახა. რიგი გრძელდება."
        : "პროდუქტის Draft შეიქმნა. რიგი გრძელდება.",
    retryCount: 0,
    lastError: null,
  });
  schedule(6_000);
}

async function processCompleteJob() {
  const result = await agentApi(`/api/catalog-agent/jobs/${state.job.id}/complete`, { status: "completed" });
  const counters = result.counters ?? {};
  await saveState({
    job: null,
    item: null,
    phase: "claim_job",
    message: `დავალება დასრულდა — Draft: ${Number(counters.draft_count ?? 0)}, გადასახედი: ${Number(counters.review_count ?? 0)}, დუბლიკატი: ${Number(counters.duplicate_count ?? 0)}. შემდეგი დავალება იძებნება…`,
    retryCount: 0,
  });
  schedule(5_000);
}

async function handleCycleError(error) {
  const message = error instanceof Error ? error.message : "Auto Queue-ის უცნობი შეცდომა";
  const status = error instanceof AgentApiError ? error.status : 0;
  const retryCount = state.retryCount + 1;
  if (status === 401 || retryCount >= 6) {
    await saveState({
      paused: true,
      resumePhase: state.phase,
      phase: "error",
      message: status === 401 ? "Agent token არ არის ავტორიზებული. შეამოწმე token და შემდეგ გააგრძელე." : "Auto Queue შეჩერდა განმეორებითი შეცდომის შემდეგ.",
      lastError: message,
      retryCount,
    });
    return;
  }
  const retryDelay = Math.min(60_000, 4_000 * (2 ** Math.min(retryCount - 1, 4)));
  await saveState({
    message: `დროებითი შეცდომა: ${message}. ხელახლა ცდა ${Math.round(retryDelay / 1_000)} წამში.`,
    lastError: message,
    retryCount,
  });
  schedule(retryDelay);
}

async function runCycle() {
  if (running) return;
  running = true;
  try {
    await loadState();
    if (!state.enabled || state.paused) return;
    switch (state.phase) {
      case "idle":
      case "claim_job":
      case "waiting_queue":
        await processClaimJob();
        break;
      case "navigate_category":
        await navigateAndWait(state.job.source_url, "discover_category", "კატეგორიის გვერდი იტვირთება…");
        break;
      case "discover_category":
        await processCategoryDiscovery();
        break;
      case "claim_item":
        await processClaimItem();
        break;
      case "navigate_item":
        await navigateAndWait(state.item.source_url, "extract_item", "პროდუქტის გვერდი იტვირთება…");
        break;
      case "extract_item":
        await processProductExtraction();
        break;
      case "complete_job":
        await processCompleteJob();
        break;
      default:
        await saveState({ phase: state.job ? (state.item ? "navigate_item" : "navigate_category") : "claim_job" });
        schedule(500);
    }
  } catch (error) {
    await handleCycleError(error);
  } finally {
    running = false;
  }
}

async function startAutoQueue() {
  await agentToken();
  await chrome.notifications.clear(VERIFICATION_NOTIFICATION);
  const nextPhase = state.resumePhase
    || (state.job ? (state.item ? "navigate_item" : "navigate_category") : "claim_job");
  await saveState({
    enabled: true,
    paused: false,
    phase: nextPhase && !["idle", "error", "waiting_queue", "stopped", "paused_manual"].includes(nextPhase) ? nextPhase : "claim_job",
    resumePhase: null,
    message: "Auto Queue დაიწყო. დავალება იძებნება…",
    lastError: null,
    retryCount: 0,
    startedAt: state.startedAt ?? new Date().toISOString(),
  });
  schedule(100);
}

async function pauseAutoQueue() {
  if (!state.enabled) return;
  await saveState({
    paused: true,
    resumePhase: state.phase,
    phase: "paused_manual",
    message: "Auto Queue ხელით შეჩერებულია. მიმდინარე პოზიცია შენახულია.",
  });
}

async function resumeAutoQueue() {
  await agentToken();
  const phase = state.resumePhase || (state.job ? (state.item ? "navigate_item" : "navigate_category") : "claim_job");
  await chrome.notifications.clear(VERIFICATION_NOTIFICATION);
  await saveState({
    enabled: true,
    paused: false,
    phase,
    resumePhase: null,
    message: "Auto Queue გრძელდება შენახული პოზიციიდან…",
    lastError: null,
    retryCount: 0,
  });
  schedule(100);
}

async function stopAutoQueue() {
  const resumePhase = state.phase === "waiting_verification" || state.phase === "paused_manual" || state.phase === "error"
    ? state.resumePhase
    : state.phase;
  await chrome.notifications.clear(VERIFICATION_NOTIFICATION);
  await saveState({
    enabled: false,
    paused: false,
    phase: "stopped",
    resumePhase,
    message: "Auto Queue გამორთულია. მიმდინარე პოზიცია შენახულია და Start-ით გაგრძელდება.",
  });
  await chrome.alarms.clear(WAKE_ALARM);
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const respond = async () => {
    await loadState();
    if (message?.type === "AUTO_QUEUE_GET_STATE") return { ok: true, state };
    if (message?.type === "AUTO_QUEUE_START") {
      await startAutoQueue();
      return { ok: true, state };
    }
    if (message?.type === "AUTO_QUEUE_PAUSE") {
      await pauseAutoQueue();
      return { ok: true, state };
    }
    if (message?.type === "AUTO_QUEUE_RESUME") {
      await resumeAutoQueue();
      return { ok: true, state };
    }
    if (message?.type === "AUTO_QUEUE_STOP") {
      await stopAutoQueue();
      return { ok: true, state };
    }
    return { ok: false, message: "Unknown Auto Queue command" };
  };
  respond().then(sendResponse).catch((error) => sendResponse({
    ok: false,
    message: error instanceof Error ? error.message : "Auto Queue command failed",
  }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WAKE_ALARM) runCycle();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === state.tabId && changeInfo.status === "complete" && state.enabled && !state.paused) schedule(800);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== state.tabId) return;
  saveState({ tabId: null }).then(() => {
    if (state.enabled && !state.paused) schedule(500);
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== VERIFICATION_NOTIFICATION || !Number.isInteger(state.tabId)) return;
  chrome.tabs.get(state.tabId).then((tab) => {
    chrome.tabs.update(state.tabId, { active: true });
    if (Number.isInteger(tab.windowId)) chrome.windows.update(tab.windowId, { focused: true });
  }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  loadState().then(updateActionBadge).then(() => {
    if (state.enabled && !state.paused) schedule(1_000);
  });
});

chrome.runtime.onStartup.addListener(() => {
  loadState().then(updateActionBadge).then(() => {
    if (state.enabled && !state.paused) schedule(1_000);
  });
});

loadState().then(updateActionBadge).then(() => {
  if (state.enabled && !state.paused) schedule(1_000);
});
