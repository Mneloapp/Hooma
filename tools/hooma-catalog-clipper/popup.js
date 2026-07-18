const PRODUCT_COLORS = [
  { name: "თეთრი", hex: "#EEEAE1" },
  { name: "შავი", hex: "#292929" },
  { name: "ნაცრისფერი", hex: "#7C7F82" },
  { name: "ბეჟი", hex: "#D8C7AD" },
  { name: "წითელი", hex: "#C74943" },
  { name: "ლურჯი", hex: "#3E6F9E" },
  { name: "მწვანე", hex: "#6E8263" },
  { name: "ყვითელი", hex: "#E2B84C" },
  { name: "ნარინჯისფერი", hex: "#D77A3D" },
  { name: "იისფერი", hex: "#785C8E" },
  { name: "ვარდისფერი", hex: "#D491A6" },
  { name: "ყავისფერი", hex: "#795548" },
];

const elements = {
  agentToken: document.querySelector("#agent-token"),
  saveAgentToken: document.querySelector("#save-agent-token"),
  resetAssisted: document.querySelector("#reset-assisted"),
  assistedConnection: document.querySelector("#assisted-connection"),
  autoQueueBadge: document.querySelector("#auto-queue-badge"),
  autoQueueState: document.querySelector("#auto-queue-state"),
  autoQueueStats: document.querySelector("#auto-queue-stats"),
  autoQueueStart: document.querySelector("#auto-queue-start"),
  autoQueuePause: document.querySelector("#auto-queue-pause"),
  autoQueueResume: document.querySelector("#auto-queue-resume"),
  autoQueueStop: document.querySelector("#auto-queue-stop"),
  agentJob: document.querySelector("#agent-job"),
  claimJob: document.querySelector("#claim-job"),
  captureCategory: document.querySelector("#capture-category"),
  openNext: document.querySelector("#open-next"),
  completeJob: document.querySelector("#complete-job"),
  submitAssisted: document.querySelector("#submit-assisted"),
  extract: document.querySelector("#extract"),
  status: document.querySelector("#status"),
  source: document.querySelector("#source"),
  form: document.querySelector("#draft"),
  name: document.querySelector("#name"),
  description: document.querySelector("#description"),
  categoryPath: document.querySelector("#category-path"),
  material: document.querySelector("#material"),
  weight: document.querySelector("#weight"),
  timeHours: document.querySelector("#time-hours"),
  timeMinutes: document.querySelector("#time-minutes"),
  colors: document.querySelector("#colors"),
  colorHint: document.querySelector("#color-hint"),
  images: document.querySelector("#images"),
  imageCount: document.querySelector("#image-count"),
  videoLink: document.querySelector("#video-link"),
  warnings: document.querySelector("#warnings"),
  export: document.querySelector("#export"),
  downloadPackage: document.querySelector("#download-package"),
};

let draft = null;
let assisted = { token: "", job: null, item: null };
let autoQueue = { enabled: false, paused: false, phase: "idle" };
const HOOMA_BASE_URL = "https://www.hooma.ge";
const AGENT_TOKEN_PATTERN = /^hooma_ca_[a-f0-9]{12}_[A-Za-z0-9_-]{48}$/;

const show = (message, type = "") => {
  elements.status.className = type;
  elements.status.textContent = message;
};

async function persistAssisted() {
  await chrome.storage.local.set({
    hoomaAssistedToken: assisted.token,
    hoomaAssistedJob: assisted.job,
    hoomaAssistedItem: assisted.item,
  });
}

function renderAssistedState() {
  const configured = AGENT_TOKEN_PATTERN.test(assisted.token);
  const autoActive = Boolean(autoQueue.enabled);
  elements.assistedConnection.textContent = configured ? `Token · ${assisted.token.split("_")[2]}••••` : "არ არის დაყენებული";
  if (assisted.job) {
    const itemLine = assisted.item ? `\nმიმდინარე პროდუქტი: ${assisted.item.source_title || assisted.item.source_url}` : "";
    elements.agentJob.textContent = `დავალება: ${assisted.job.category_label}\nლიმიტი: ${assisted.job.max_products}${itemLine}`;
  } else {
    elements.agentJob.textContent = "ჯერ აიღე Hooma Admin-ში შექმნილი assisted დავალება.";
  }
  elements.saveAgentToken.disabled = autoActive;
  elements.resetAssisted.disabled = autoActive;
  elements.claimJob.disabled = autoActive || !configured || Boolean(assisted.job);
  elements.captureCategory.disabled = autoActive || !configured || !assisted.job;
  elements.openNext.disabled = autoActive || !configured || !assisted.job;
  elements.completeJob.disabled = autoActive || !configured || !assisted.job || Boolean(assisted.item);
  elements.submitAssisted.disabled = autoActive || !configured || !assisted.job || !assisted.item || !draft;
  elements.extract.disabled = autoActive;
  elements.autoQueueStart.disabled = !configured || autoActive;
  elements.autoQueuePause.disabled = !autoActive || Boolean(autoQueue.paused);
  elements.autoQueueResume.disabled = !autoActive || !autoQueue.paused;
  elements.autoQueueStop.disabled = !autoActive;
  elements.autoQueueBadge.textContent = autoActive ? (autoQueue.paused ? "PAUSED" : "RUNNING") : "OFF";
  elements.autoQueueBadge.className = `queue-badge${autoActive ? autoQueue.paused ? " paused" : " running" : ""}`;
  elements.autoQueueState.textContent = autoQueue.message || "Auto Queue მზადაა.";
  elements.autoQueueStats.textContent = `დამუშავებული ${Number(autoQueue.processedCount ?? 0)} · Draft ${Number(autoQueue.draftCount ?? 0)} · გადასახედი ${Number(autoQueue.reviewCount ?? 0)} · დუბლიკატი ${Number(autoQueue.duplicateCount ?? 0) + Number(autoQueue.skippedDuplicates ?? 0)} · Failed ${Number(autoQueue.failedCount ?? 0)}`;
}

async function autoQueueCommand(type) {
  const result = await chrome.runtime.sendMessage({ type });
  if (!result?.ok) throw new Error(result?.message || "Auto Queue ბრძანება ვერ შესრულდა.");
  autoQueue = result.state ?? autoQueue;
  renderAssistedState();
  return autoQueue;
}

async function agentApi(pathname, body = {}) {
  if (!AGENT_TOKEN_PATTERN.test(assisted.token)) throw new Error("ჯერ შეინახე assisted Agent-ის სწორი token.");
  const response = await fetch(`${HOOMA_BASE_URL}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${assisted.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) throw new Error(result.message || `Hooma API returned HTTP ${response.status}`);
  return result;
}

async function activeHttpTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:\/\//i.test(tab.url ?? "")) throw new Error("გახსენი ჩვეულებრივი HTTP/HTTPS გვერდი.");
  return tab;
}

function normalizedCatalogUrl(value) {
  const url = new URL(value);
  url.hash = "";
  ["from", "ref", "source", "spm_id_from"].forEach((key) => url.searchParams.delete(key));
  Array.from(url.searchParams.keys()).forEach((key) => {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  });
  return url.toString();
}

async function pageRequestsVerification(tabId) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const snapshot = `${document.title} ${document.body?.innerText || ""}`.slice(0, 20_000);
      return /performing security verification|verify you are (?:a )?human|verify you are not a bot|checking your browser|captcha|access denied|unusual traffic|robot verification/i.test(snapshot);
    },
  });
  return Boolean(result?.[0]?.result);
}

async function loadAssistedState() {
  const stored = await chrome.storage.local.get(["hoomaAssistedToken", "hoomaAssistedJob", "hoomaAssistedItem"]);
  assisted = {
    token: typeof stored.hoomaAssistedToken === "string" ? stored.hoomaAssistedToken.trim() : "",
    job: stored.hoomaAssistedJob && typeof stored.hoomaAssistedJob === "object" ? stored.hoomaAssistedJob : null,
    item: stored.hoomaAssistedItem && typeof stored.hoomaAssistedItem === "object" ? stored.hoomaAssistedItem : null,
  };
  try {
    const result = await chrome.runtime.sendMessage({ type: "AUTO_QUEUE_GET_STATE" });
    if (result?.ok && result.state) autoQueue = result.state;
  } catch { /* Manual Mode remains available if the worker is restarting. */ }
  renderAssistedState();
}
const numeric = (element) => element.value === "" ? null : Number(element.value);
const selectedImages = () => Array.from(elements.images.querySelectorAll('input[type="checkbox"]:checked')).map((item) => item.value).slice(0, 12);
const selectedColors = () => Array.from(elements.colors.querySelectorAll('input[type="checkbox"]:checked')).map((item) => item.value);
const selectedColorMode = () => document.querySelector('input[name="color-mode"]:checked')?.value === "fixed_multicolor" ? "fixed_multicolor" : "customer_choice";
const slug = (value) => String(value || "hooma-product").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u10a0-\u10ff]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "hooma-product";
const categoryPath = () => elements.categoryPath.value
  .split(/\s*(?:→|›|>)\s*/)
  .map((item) => item.trim())
  .filter(Boolean)
  .slice(0, 8);

function printTimeInMinutes() {
  const hours = numeric(elements.timeHours);
  const minutes = numeric(elements.timeMinutes);
  if (hours === null && minutes === null) return null;
  if (!Number.isInteger(hours ?? 0) || !Number.isInteger(minutes ?? 0) || (hours ?? 0) < 0 || (minutes ?? 0) < 0 || (minutes ?? 0) > 59) {
    show("ბეჭდვის დრო სწორად შეავსე: საათი უნდა იყოს მთელი რიცხვი, წუთი კი 0-დან 59-მდე.", "error");
    return undefined;
  }
  const total = (hours ?? 0) * 60 + (minutes ?? 0);
  return total > 0 ? total : null;
}

function syncDraft() {
  if (!draft) return null;
  const colorMode = selectedColorMode();
  const colors = selectedColors();
  const minimumColors = colorMode === "fixed_multicolor" ? 2 : 1;
  if (colors.length < minimumColors) {
    show(colorMode === "fixed_multicolor" ? "AMS პროდუქტისთვის მონიშნე მინიმუმ ორი ფერი." : "მონიშნე მინიმუმ ერთი ფერი.", "error");
    return null;
  }
  const printTimeMinutes = printTimeInMinutes();
  if (printTimeMinutes === undefined) return null;
  draft.product.name = elements.name.value.trim() || null;
  draft.product.description = elements.description.value.trim() || null;
  draft.product.categoryPath = categoryPath();
  draft.product.categoryHint = draft.product.categoryPath.at(-1) ?? null;
  draft.product.media.imageUrls = selectedImages();
  draft.product.technical.material = elements.material.value.trim() || null;
  draft.product.technical.weightGrams = numeric(elements.weight);
  draft.product.technical.printTimeMinutes = printTimeMinutes;
  draft.product.technical.colorMode = colorMode;
  draft.product.technical.colors = colors;
  return draft;
}

function updateImageCount() {
  elements.imageCount.textContent = `${selectedImages().length} არჩეული`;
}

function updateColorHint() {
  elements.colorHint.textContent = selectedColorMode() === "fixed_multicolor"
    ? "მონიშნე AMS-ის ფიქსირებულ კომბინაციაში შემავალი მინიმუმ ორი ფერი."
    : "მონიშნე მომხმარებლისთვის ხელმისაწვდომი მინიმუმ ერთი ფერი.";
}

function renderColorOptions() {
  elements.colors.replaceChildren();
  PRODUCT_COLORS.forEach((color) => {
    const label = document.createElement("label");
    label.className = "color-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = color.name;
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = color.hex;
    const name = document.createElement("span");
    name.className = "color-name";
    name.textContent = color.name;
    label.append(checkbox, swatch, name);
    elements.colors.append(label);
  });
}

async function downloadJson(data, saveAs, folderName = slug(data.product.name)) {
  const encoded = encodeURIComponent(JSON.stringify(data, null, 2));
  return chrome.downloads.download({
    url: `data:application/json;charset=utf-8,${encoded}`,
    filename: `hooma-import/${folderName}/product.hooma.json`,
    saveAs,
  });
}

function render(data) {
  draft = data;
  const technical = data.product.technical;
  elements.source.textContent = data.source.url;
  elements.name.value = data.product.name ?? "";
  elements.description.value = data.product.description ?? "";
  elements.categoryPath.value = (Array.isArray(data.product.categoryPath) && data.product.categoryPath.length
    ? data.product.categoryPath
    : data.product.categoryHint ? [data.product.categoryHint] : []).join(" → ");
  elements.material.value = technical.material ?? "";
  elements.weight.value = technical.weightGrams ?? "";
  elements.timeHours.value = technical.printTimeMinutes === null ? "" : Math.floor(technical.printTimeMinutes / 60);
  elements.timeMinutes.value = technical.printTimeMinutes === null ? "" : Math.round(technical.printTimeMinutes % 60);
  const colorMode = technical.colorMode === "fixed_multicolor" ? "fixed_multicolor" : "customer_choice";
  const modeInput = document.querySelector(`input[name="color-mode"][value="${colorMode}"]`);
  if (modeInput) modeInput.checked = true;
  const importedColors = new Set(Array.isArray(technical.colors) ? technical.colors : []);
  elements.colors.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => { checkbox.checked = importedColors.has(checkbox.value); });
  updateColorHint();
  elements.images.replaceChildren();
  data.product.media.imageUrls.forEach((url, index) => {
    const label = document.createElement("label");
    label.className = "image-option";
    label.title = url;
    const image = document.createElement("img");
    image.src = url;
    image.alt = `Product image ${index + 1}`;
    image.loading = "lazy";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = url;
    checkbox.checked = index < 12;
    checkbox.addEventListener("change", () => {
      if (selectedImages().length > 12) {
        checkbox.checked = false;
        show("მაქსიმუმ 12 ფოტოს მონიშვნა შეიძლება.", "error");
      }
      updateImageCount();
    });
    label.append(image, checkbox);
    elements.images.append(label);
  });
  elements.videoLink.hidden = !data.product.media.videoUrl;
  if (data.product.media.videoUrl) elements.videoLink.href = data.product.media.videoUrl;
  elements.warnings.replaceChildren();
  data.warnings.forEach((message) => {
    const warning = document.createElement("div");
    warning.className = "warning";
    warning.textContent = message;
    elements.warnings.append(warning);
  });
  elements.form.hidden = false;
  updateImageCount();
  renderAssistedState();
}

renderColorOptions();
document.querySelectorAll('input[name="color-mode"]').forEach((input) => input.addEventListener("change", updateColorHint));

elements.autoQueueStart.addEventListener("click", async () => {
  elements.autoQueueStart.disabled = true;
  show("Auto Queue იწყება…");
  try {
    await autoQueueCommand("AUTO_QUEUE_START");
    show("Auto Queue ჩაირთო. შეგიძლია popup დახურო — რიგი ფონურად გაგრძელდება.", "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "Auto Queue ვერ დაიწყო.", "error");
  } finally {
    renderAssistedState();
  }
});

elements.autoQueuePause.addEventListener("click", async () => {
  show("Auto Queue ჩერდება…");
  try {
    await autoQueueCommand("AUTO_QUEUE_PAUSE");
    show("Auto Queue შეჩერდა და მიმდინარე პოზიცია შეინახა.", "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "Auto Queue ვერ შეჩერდა.", "error");
  }
});

elements.autoQueueResume.addEventListener("click", async () => {
  show("Auto Queue გრძელდება…");
  try {
    await autoQueueCommand("AUTO_QUEUE_RESUME");
    show("Auto Queue შენახული პოზიციიდან გაგრძელდა.", "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "Auto Queue ვერ გაგრძელდა.", "error");
  }
});

elements.autoQueueStop.addEventListener("click", async () => {
  show("Auto Queue ითიშება…");
  try {
    await autoQueueCommand("AUTO_QUEUE_STOP");
    show("Auto Queue გამორთულია; მიმდინარე პოზიცია შენახულია.", "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "Auto Queue ვერ გაითიშა.", "error");
  }
});

elements.extract.addEventListener("click", async () => {
  elements.extract.disabled = true;
  show("გვერდის საჯარო მონაცემები იკითხება...");
  try {
    const tab = await activeHttpTab();
    if (await pageRequestsVerification(tab.id)) {
      throw new Error("ჯერ დაასრულე გვერდზე human verification, დაელოდე პროდუქტის სრულად გახსნას და შემდეგ სცადე თავიდან.");
    }
    if (assisted.item && normalizedCatalogUrl(tab.url) !== normalizedCatalogUrl(assisted.item.source_url)) {
      throw new Error("გახსნილი გვერდი რიგიდან აღებულ პროდუქტს არ ემთხვევა. დააჭირე „შემდეგი პროდუქტის გახსნა“.");
    }
    const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["extractor.js"] });
    const data = results?.[0]?.result;
    if (!data?.product || data.schema !== "hooma-catalog-clipper-v1") throw new Error("გვერდიდან პროდუქტის მონაცემები ვერ მომზადდა.");
    render(data);
    show(`მონაცემები მომზადდა. ნაპოვნია ${data.product.media.imageUrls.length} ფოტო; გადაამოწმე ყველა ველი.`, "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "გვერდი ვერ წავიკითხე. განაახლე და სცადე თავიდან.", "error");
  } finally {
    elements.extract.disabled = false;
  }
});

elements.saveAgentToken.addEventListener("click", async () => {
  const token = elements.agentToken.value.trim();
  if (!AGENT_TOKEN_PATTERN.test(token)) {
    show("ტოკენი არასწორია. ჩასვი Admin → Catalog Agent-ში რეგისტრირებული ცალკე Assisted Agent-ის სრული token.", "error");
    return;
  }
  assisted.token = token;
  assisted.job = null;
  assisted.item = null;
  draft = null;
  elements.form.hidden = true;
  elements.agentToken.value = "";
  elements.agentToken.placeholder = "ტოკენი შენახულია";
  await persistAssisted();
  renderAssistedState();
  show("Assisted Agent-ის ტოკენი ლოკალურად შეინახა ამ Chrome პროფილმა.", "ok");
});

elements.resetAssisted.addEventListener("click", async () => {
  assisted.job = null;
  assisted.item = null;
  draft = null;
  elements.form.hidden = true;
  await persistAssisted();
  renderAssistedState();
  show("Assisted სესია გასუფთავდა. შენახული Agent token დარჩა აქტიური.", "ok");
});

elements.claimJob.addEventListener("click", async () => {
  elements.claimJob.disabled = true;
  show("Hooma Admin-იდან assisted დავალება იძებნება...");
  try {
    const result = await agentApi("/api/catalog-agent/jobs/claim", { workerName: "Hooma MakerWorld Assisted · Chrome" });
    if (!result.job) {
      show("ამ Assisted Agent-ზე რიგში დავალება არ არის. შექმენი Admin → Catalog Agent-ში და ისევ სცადე.", "error");
      return;
    }
    assisted.job = result.job;
    assisted.item = null;
    draft = null;
    elements.form.hidden = true;
    await persistAssisted();
    renderAssistedState();
    show(`დავალება აღებულია: ${result.job.category_label}. ახლა გახსენი კატეგორიის გვერდი და დაამატე ხილული პროდუქტები რიგში.`, "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "დავალება ვერ აიღო.", "error");
  } finally {
    renderAssistedState();
  }
});

elements.captureCategory.addEventListener("click", async () => {
  elements.captureCategory.disabled = true;
  show("გახსნილ გვერდზე ხილული პროდუქტების ბმულები იკრიბება...");
  try {
    if (!assisted.job) throw new Error("ჯერ აიღე assisted დავალება.");
    const tab = await activeHttpTab();
    if (await pageRequestsVerification(tab.id)) {
      throw new Error("ჯერ დაასრულე human verification და დაელოდე კატეგორიის პროდუქტების გამოჩენას.");
    }
    const expectedHost = new URL(assisted.job.source_url).hostname.toLowerCase();
    const activeHost = new URL(tab.url).hostname.toLowerCase();
    if (activeHost !== expectedHost && !activeHost.endsWith(`.${expectedHost}`) && !expectedHost.endsWith(`.${activeHost}`)) {
      throw new Error(`გახსენი დავალების წყაროს გვერდი: ${expectedHost}`);
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (host) => {
        const acceptedHost = (candidate) => candidate === host || candidate.endsWith(`.${host}`) || host.endsWith(`.${candidate}`);
        const discovered = new Map();
        for (const link of document.querySelectorAll('a[href*="/models/"]')) {
          try {
            const rect = link.getBoundingClientRect();
            const style = getComputedStyle(link);
            if (
              style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0
              || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= innerHeight
              || rect.right <= 0 || rect.left >= innerWidth
            ) continue;
            const url = new URL(link.href, location.href);
            if (url.protocol !== "https:" || !acceptedHost(url.hostname.toLowerCase())) continue;
            const modelId = url.pathname.match(/\/models\/(\d+)/i)?.[1] ?? null;
            if (!modelId) continue;
            url.hash = "";
            for (const key of ["from", "ref", "source", "spm_id_from"]) url.searchParams.delete(key);
            for (const key of Array.from(url.searchParams.keys())) {
              if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
            }
            const sourceUrl = url.toString();
            const sourceTitle = (link.getAttribute("title") || link.getAttribute("aria-label") || link.textContent || "")
              .replace(/\s+/g, " ").trim().slice(0, 240) || null;
            if (!discovered.has(sourceUrl)) discovered.set(sourceUrl, { sourceUrl, sourceTitle, sourceModelId: modelId });
          } catch { /* Ignore malformed or off-site links. */ }
        }
        return Array.from(discovered.values()).slice(0, 100);
      },
      args: [expectedHost],
    });
    const items = results?.[0]?.result ?? [];
    if (!items.length) throw new Error("ამ ეკრანზე პროდუქტის ბმულები ვერ ვიპოვე. დარწმუნდი, რომ კატეგორიის პროდუქტები ჩანს.");
    const result = await agentApi(`/api/catalog-agent/jobs/${assisted.job.id}/discover`, {
      items,
      cursor: { mode: "human_assisted", capturedAt: new Date().toISOString(), pageUrl: tab.url },
    });
    const duplicateCount = Number(result.skippedDuplicates ?? 0) + Number(result.alreadyInJob ?? 0);
    const suffix = result.limitReached ? " დავალების ლიმიტიც შევსებულია." : " თუ ქვემოთ კიდევ პროდუქტებია, თავად ჩამოსქროლე და ღილაკს ხელახლა დააჭირე.";
    show(`${result.accepted} ახალი პროდუქტი დაემატა რიგში; ${duplicateCount} უკვე დამუშავებული/დამატებული პროდუქტი გამოტოვებულია.${suffix}`, "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "პროდუქტების ბმულები ვერ დაემატა.", "error");
  } finally {
    renderAssistedState();
  }
});

elements.openNext.addEventListener("click", async () => {
  elements.openNext.disabled = true;
  show("შემდეგი პროდუქტი მზადდება გასახსნელად...");
  try {
    if (!assisted.job) throw new Error("ჯერ აიღე assisted დავალება.");
    if (!assisted.item) {
      let result;
      do {
        result = await agentApi(`/api/catalog-agent/jobs/${assisted.job.id}/items/claim`);
      } while (!result.item && result.continueClaiming);
      if (!result.item) {
        show("რიგში დაუმუშავებელი პროდუქტი აღარ არის. საჭიროების შემთხვევაში დაამატე კიდევ ხილული ბმულები ან დაასრულე დავალება.", "ok");
        return;
      }
      assisted.item = result.item;
      draft = null;
      elements.form.hidden = true;
      await persistAssisted();
    }
    const tab = await activeHttpTab();
    await chrome.tabs.update(tab.id, { url: assisted.item.source_url });
  } catch (error) {
    show(error instanceof Error ? error.message : "პროდუქტის გვერდი ვერ გაიხსნა.", "error");
    renderAssistedState();
  }
});

elements.submitAssisted.addEventListener("click", async () => {
  elements.submitAssisted.disabled = true;
  show("Draft იგზავნება Hooma-ში...");
  try {
    if (!assisted.job || !assisted.item) throw new Error("ამ გვერდისთვის რიგიდან პროდუქტი ჯერ არ აგიღია.");
    const data = syncDraft();
    if (!data) return;
    const result = await agentApi(`/api/catalog-agent/jobs/${assisted.job.id}/items/${assisted.item.id}/draft`, { payload: data });
    const statusMessages = {
      draft_created: "პროდუქტის Draft შეიქმნა Hooma-ში.",
      needs_review: `მონაცემები შენახულია გადასახედად${Array.isArray(result.missing) && result.missing.length ? `: ${result.missing.join(", ")}` : "."}`,
      duplicate: "ეს პროდუქტი Hooma-ში უკვე არსებობდა და დუბლიკატი აღარ შექმნილა.",
    };
    const message = statusMessages[result.status] || `პროდუქტი დამუშავდა: ${result.status}.`;
    assisted.item = null;
    draft = null;
    elements.form.hidden = true;
    await persistAssisted();
    renderAssistedState();
    show(`${message} შემდეგი პროდუქტის გასახსნელად დააჭირე შესაბამის ღილაკს.`, "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "Draft ვერ გაიგზავნა Hooma-ში.", "error");
  } finally {
    renderAssistedState();
  }
});

elements.completeJob.addEventListener("click", async () => {
  elements.completeJob.disabled = true;
  show("დავალება სრულდება...");
  try {
    if (!assisted.job) throw new Error("აქტიური დავალება არ არის.");
    const result = await agentApi(`/api/catalog-agent/jobs/${assisted.job.id}/complete`, { status: "completed" });
    const counters = result.counters ?? {};
    assisted.job = null;
    assisted.item = null;
    draft = null;
    elements.form.hidden = true;
    await persistAssisted();
    renderAssistedState();
    show(`დავალება დასრულდა. Draft: ${Number(counters.draft_count ?? 0)}, გადასახედი: ${Number(counters.review_count ?? 0)}, დუბლიკატი: ${Number(counters.duplicate_count ?? 0)}.`, "ok");
  } catch (error) {
    show(error instanceof Error ? error.message : "დავალება ვერ დასრულდა.", "error");
  } finally {
    renderAssistedState();
  }
});

elements.export.addEventListener("click", async () => {
  const data = syncDraft();
  if (!data) return;
  await downloadJson(data, true);
  show("Hooma JSON მზადაა. ახლა შემოიტანე Admin → პროდუქტები → ახალი პროდუქტი გვერდზე.", "ok");
});

elements.downloadPackage.addEventListener("click", async () => {
  const data = syncDraft();
  if (!data) return;
  const images = data.product.media.imageUrls;
  const directVideo = data.product.media.videoUrl && /\.(?:mp4|webm)(?:$|\?)/i.test(data.product.media.videoUrl)
    ? data.product.media.videoUrl
    : null;
  if (!images.length) { show("სრულ პაკეტს მინიმუმ ერთი ფოტო სჭირდება.", "error"); return; }
  elements.downloadPackage.disabled = true;
  const packageFolder = `${slug(data.product.name)}-${Date.now()}`;
  let failures = 0;
  try {
    await downloadJson(data, false, packageFolder);
  } catch { failures += 1; }
  for (let index = 0; index < images.length; index += 1) {
    try {
      const pathname = new URL(images[index]).pathname;
      const extension = pathname.match(/\.(jpe?g|png|webp)(?:$|\/)/i)?.[1]?.toLowerCase() ?? "jpg";
      await chrome.downloads.download({
        url: images[index],
        filename: `hooma-import/${packageFolder}/image-${String(index + 1).padStart(2, "0")}.${extension}`,
        saveAs: false,
      });
    } catch { failures += 1; }
  }
  if (directVideo) {
    try {
      const extension = new URL(directVideo).pathname.toLowerCase().endsWith(".webm") ? "webm" : "mp4";
      await chrome.downloads.download({
        url: directVideo,
        filename: `hooma-import/${packageFolder}/video.${extension}`,
        saveAs: false,
      });
    } catch { failures += 1; }
  }
  elements.downloadPackage.disabled = false;
  const total = 1 + images.length + (directVideo ? 1 : 0);
  show(
    failures
      ? `პაკეტის ${total - failures}/${total} ფაილი ჩამოიტვირთა; ${failures} ფაილი წყარომ დაბლოკა.`
      : `სრული პაკეტი ჩამოიტვირთა: JSON და ${images.length} ფოტო${directVideo ? ", ვიდეო" : ""}.`,
    failures ? "" : "ok",
  );
});

loadAssistedState().catch(() => {
  assisted = { token: "", job: null, item: null };
  renderAssistedState();
  show("Assisted Mode-ის ლოკალური მდგომარეობა ვერ წავიკითხე. თავიდან შეინახე token.", "error");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "AUTO_QUEUE_STATE_CHANGED" || !message.state) return;
  autoQueue = message.state;
  renderAssistedState();
});
