(() => {
  const MAX_IMAGES = 40;
  const MATERIAL_PATTERN = /\b(PLA(?:\+|\s*PLUS|\s*BASIC|\s*MATTE|\s*TOUGH)?|PETG(?:-?CF)?|ABS|ASA|TPU(?:\s*\d+[AD])?|TPE|PC|PA(?:6|12)?(?:-?CF)?|NYLON|PVA|HIPS)\b/i;

  const clean = (value, maximum = 3000) => {
    if (typeof value !== "string") return null;
    const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return text ? text.slice(0, maximum) : null;
  };
  const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const number = (value) => {
    const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const absoluteUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  };
  const meta = (...selectors) => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.getAttribute("content");
      if (clean(value)) return clean(value);
    }
    return null;
  };
  const values = (value) => Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const typeNames = (node) => values(node?.["@type"]).map((item) => String(item).toLowerCase());

  function jsonLdObjects() {
    const result = [];
    const visit = (value, depth = 0) => {
      if (!value || depth > 10) return;
      if (Array.isArray(value)) {
        value.slice(0, 200).forEach((item) => visit(item, depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      result.push(value);
      if (Array.isArray(value["@graph"])) visit(value["@graph"], depth + 1);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      const content = script.textContent?.trim();
      if (!content || content.length > 2 * 1024 * 1024) return;
      try { visit(JSON.parse(content)); } catch { /* A broken JSON-LD block must not stop extraction. */ }
    });
    return result;
  }

  const ldObjects = jsonLdObjects();
  const product = ldObjects.find((item) => typeNames(item).some((type) => ["product", "individualproduct", "3dmodel"].includes(type))) ?? null;
  const bodyText = (document.body?.innerText ?? "").replace(/\u00a0/g, " ").slice(0, 250000);

  const name = clean(product?.name, 160)
    ?? meta('meta[property="og:title"]', 'meta[name="twitter:title"]')
    ?? clean(document.querySelector("h1")?.textContent, 160)
    ?? clean(document.title, 160);
  const description = clean(product?.description)
    ?? meta('meta[property="og:description"]', 'meta[name="twitter:description"]', 'meta[name="description"]');

  const imageCandidates = [];
  const addImage = (candidate, score = 0) => {
    const url = absoluteUrl(typeof candidate === "object" && candidate
      ? candidate.url ?? candidate.contentUrl ?? candidate.thumbnailUrl
      : candidate);
    if (!url || url.startsWith("data:") || /(?:sprite|favicon|avatar|logo|icon)/i.test(url)) return;
    if (!imageCandidates.some((item) => item.url === url)) imageCandidates.push({ url, score });
  };
  values(product?.image).forEach((item) => addImage(item, 100));
  addImage(meta('meta[property="og:image"]'), 95);
  addImage(meta('meta[name="twitter:image"]'), 90);
  document.querySelectorAll("img").forEach((image) => {
    const rect = image.getBoundingClientRect();
    const width = image.naturalWidth || rect.width;
    const height = image.naturalHeight || rect.height;
    if (width < 220 || height < 180) return;
    const visible = rect.width > 0 && rect.height > 0;
    addImage(image.currentSrc || image.src, (visible ? 50 : 10) + Math.min(width * height / 100000, 30));
    String(image.srcset ?? "").split(",").forEach((entry) => addImage(entry.trim().split(/\s+/)[0], 20));
  });
  const imageUrls = imageCandidates.sort((a, b) => b.score - a.score).slice(0, MAX_IMAGES).map((item) => item.url);

  const videoObject = typeof product?.video === "object" && product.video ? product.video : null;
  const videoUrl = absoluteUrl(
    videoObject?.contentUrl
      ?? videoObject?.embedUrl
      ?? (typeof product?.video === "string" ? product.video : null)
      ?? meta('meta[property="og:video"]', 'meta[property="og:video:url"]')
      ?? document.querySelector("video")?.currentSrc
      ?? document.querySelector("video source")?.src,
  );

  const materialText = [
    product?.material,
    product?.additionalProperty && JSON.stringify(product.additionalProperty).slice(0, 10000),
    bodyText.match(/(?:material|filament)[^\n]{0,100}/i)?.[0],
  ].filter(Boolean).join(" ");
  const material = clean(materialText.match(MATERIAL_PATTERN)?.[1]?.toUpperCase(), 120);

  const weightMatch = bodyText.match(/(?:model\s+weight|material\s+(?:used|weight)|filament(?:\s+used)?|weight)[^\n\r]{0,80}?(\d+(?:[.,]\d+)?)\s*(kg|g|gram|grams)\b/i);
  let weightGrams = number(weightMatch?.[1]);
  if (weightGrams && weightMatch?.[2]?.toLowerCase() === "kg") weightGrams *= 1000;
  if (weightGrams) weightGrams = round(weightGrams);

  const timeText = bodyText.match(/(?:print(?:ing)?\s*(?:time|duration)|estimated\s*time)[^\n\r]{0,100}/i)?.[0] ?? "";
  const timeHours = number(timeText.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i)?.[1]) ?? 0;
  const timeMinutes = number(timeText.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i)?.[1]) ?? 0;
  let printTimeMinutes = timeHours || timeMinutes ? Math.max(1, Math.round(timeHours * 60 + timeMinutes)) : null;
  if (!printTimeMinutes) {
    const clock = timeText.match(/\b(\d{1,3}):(\d{2})(?::(\d{2}))?\b/);
    if (clock) printTimeMinutes = clock[3]
      ? Math.max(1, Math.round(Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3]) / 60))
      : Math.max(1, Math.round(Number(clock[1]) * 60 + Number(clock[2])));
  }

  const dimensionText = bodyText.match(/(?:dimensions?|model\s*size|object\s*size|bounding\s*box)[^\n\r]{0,140}/i)?.[0]
    ?? bodyText.match(/\d+(?:[.,]\d+)?\s*[x×*]\s*\d+(?:[.,]\d+)?\s*[x×*]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|in(?:ch(?:es)?)?)/i)?.[0]
    ?? "";
  const dimensionMatch = dimensionText.match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|in(?:ch(?:es)?)?)?/i);
  let dimensionsMm = null;
  if (dimensionMatch) {
    const unit = dimensionMatch[4]?.toLowerCase() ?? "mm";
    const scale = unit === "cm" ? 10 : unit.startsWith("in") ? 25.4 : 1;
    dimensionsMm = {
      x: round(number(dimensionMatch[1]) * scale),
      y: round(number(dimensionMatch[2]) * scale),
      z: round(number(dimensionMatch[3]) * scale),
    };
  }

  const categoryHint = clean(
    product?.category
      ?? product?.additionalType
      ?? document.querySelector('nav[aria-label*="breadcrumb" i] a:last-of-type')?.textContent,
    160,
  );
  const warnings = [];
  if (!name) warnings.push("პროდუქტის სახელი ვერ მოიძებნა.");
  if (!description) warnings.push("აღწერა ვერ მოიძებნა.");
  if (!imageUrls.length) warnings.push("ფოტო ვერ მოიძებნა.");
  if (!material) warnings.push("მასალის ტიპი ვერ მოიძებნა.");
  if (!weightGrams) warnings.push("წონა ვერ მოიძებნა.");
  if (!printTimeMinutes) warnings.push("ბეჭდვის დრო ვერ მოიძებნა.");
  if (!dimensionsMm) warnings.push("ზომები ვერ მოიძებნა.");
  warnings.push("გამოქვეყნებამდე გადაამოწმე მონაცემები, მედიის ხარისხი და გამოყენების უფლება.");

  return {
    schema: "hooma-catalog-clipper-v1",
    extractedAt: new Date().toISOString(),
    source: {
      url: location.href,
      platform: location.hostname.replace(/^www\./, ""),
      pageTitle: clean(document.title, 300),
    },
    product: {
      name,
      description,
      operatorReference: location.href,
      categoryHint,
      media: { imageUrls, videoUrl },
      technical: {
        material,
        weightGrams,
        printTimeMinutes,
        dimensionsMm,
        marginPercent: null,
        colorMode: "customer_choice",
        colors: [],
      },
    },
    warnings,
  };
})();
