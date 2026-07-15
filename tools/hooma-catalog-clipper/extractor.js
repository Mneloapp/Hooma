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
  const isVisible = (element) => {
    if (!(element instanceof Element) || element.closest('[hidden], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    return style.display !== "none"
      && style.visibility !== "hidden"
      && style.opacity !== "0"
      && element.getClientRects().length > 0;
  };
  const visibleText = (element, maximum = 3000) => {
    if (!isVisible(element)) return null;
    return clean(element.innerText || element.textContent, maximum);
  };
  const firstVisibleText = (selectors, maximum = 3000, minimum = 1) => {
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = visibleText(element, maximum);
        if (text && text.length >= minimum) return text;
      }
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

  // Chrome's page translator changes rendered text nodes, but it deliberately leaves
  // JSON-LD and Open Graph metadata untouched. Prefer visible copy so a translated page
  // exports the Georgian text the operator can actually see.
  const visibleName = firstVisibleText([
    "main h1",
    "article h1",
    "h1",
    '[itemprop="name"]',
  ], 160);
  const structuredName = clean(product?.name, 160)
    ?? meta('meta[property="og:title"]', 'meta[name="twitter:title"]');
  const name = visibleName
    ?? structuredName
    ?? clean(document.title, 160);

  const visibleDescription = firstVisibleText([
    'main [itemprop="description"]',
    'article [itemprop="description"]',
    'main [data-testid*="description" i]',
    'main [data-test*="description" i]',
    'main [id="description" i]',
    'main [id*="product-description" i]',
    'main [id*="model-description" i]',
    'main [class*="product-description" i]',
    'main [class*="model-description" i]',
    'main [class*="design-description" i]',
    'main [class*="introduction" i]',
    'main [class*="markdown" i]',
    'main [class*="rich-text" i]',
    'main [class~="description" i]',
    'article [class*="description" i]',
  ], 3000, 10);

  const descriptionHeadingPattern = /^(?:description|details|product description|model description|model details|about this (?:item|product|model)|აღწერა|დეტალები|პროდუქტის აღწერა|მოდელის აღწერა|მოდელის დეტალები|ამ (?:ნივთის|პროდუქტის|მოდელის) შესახებ)\s*:?$/i;
  let descriptionByHeading = null;
  if (!visibleDescription) {
    const headings = document.querySelectorAll('main h2, main h3, main h4, main [role="heading"], article h2, article h3, summary');
    for (const heading of headings) {
      const headingText = visibleText(heading, 120);
      if (!headingText || !descriptionHeadingPattern.test(headingText)) continue;
      let sibling = heading.nextElementSibling;
      while (sibling && !descriptionByHeading) {
        const text = visibleText(sibling, 3000);
        if (text && text.length >= 10) descriptionByHeading = text;
        sibling = sibling.nextElementSibling;
      }
      if (descriptionByHeading) break;
    }
  }

  const hasGeorgian = (value) => /[\u10a0-\u10ff]/i.test(value ?? "");
  const pageLooksTranslated = document.documentElement.classList.contains("translated-ltr")
    || document.documentElement.classList.contains("translated-rtl")
    || document.documentElement.lang.toLowerCase().startsWith("ka")
    || (hasGeorgian(visibleName) && !hasGeorgian(structuredName));
  let translatedParagraph = null;
  if (!visibleDescription && !descriptionByHeading && pageLooksTranslated) {
    translatedParagraph = Array.from(document.querySelectorAll("main p, article p"))
      .map((element) => visibleText(element, 3000))
      .filter((text) => text && text.length >= 30 && hasGeorgian(text))
      .sort((left, right) => right.length - left.length)[0] ?? null;
  }

  const description = visibleDescription
    ?? descriptionByHeading
    ?? translatedParagraph
    ?? clean(product?.description)
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

  const categoryKey = (value) => String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u10a0-\u10ff]+/g, "")
    .trim();
  const genericBreadcrumbItems = new Set([
    "home", "homepage", "makerworld", "models", "3dmodels", "allmodels",
    "მთავარი", "საწყისი", "მოდელები", "3დმოდელები", "ყველამოდელი",
  ].map(categoryKey));
  const cleanCategoryPath = (items) => {
    const productKey = categoryKey(name);
    const result = [];
    items.forEach((item) => {
      const label = clean(item, 160);
      const key = categoryKey(label);
      if (!label || !key || genericBreadcrumbItems.has(key)) return;
      if (productKey && (key === productKey || productKey.startsWith(key) || key.startsWith(productKey))) return;
      if (categoryKey(result[result.length - 1]) !== key) result.push(label);
    });
    return result.slice(0, 8);
  };

  let visibleCategoryPath = [];
  const breadcrumbSelectors = [
    'nav[aria-label*="breadcrumb" i]',
    '[data-testid*="breadcrumb" i]',
    '[data-test*="breadcrumb" i]',
    '[class*="breadcrumb" i]',
    'ol[itemtype*="BreadcrumbList" i]',
  ];
  for (const selector of breadcrumbSelectors) {
    const containers = document.querySelectorAll(selector);
    for (const container of containers) {
      if (!isVisible(container)) continue;
      let labels = Array.from(container.querySelectorAll('a, [aria-current="page"]'))
        .map((element) => visibleText(element, 160))
        .filter(Boolean);
      if (labels.length < 2) {
        labels = Array.from(container.querySelectorAll("li"))
          .map((element) => visibleText(element, 160))
          .filter(Boolean);
      }
      const path = cleanCategoryPath(labels);
      if (path.length > visibleCategoryPath.length) visibleCategoryPath = path;
    }
  }

  const breadcrumbObject = ldObjects.find((item) => typeNames(item).includes("breadcrumblist"));
  const structuredBreadcrumbPath = cleanCategoryPath(values(breadcrumbObject?.itemListElement)
    .slice()
    .sort((left, right) => Number(left?.position ?? 0) - Number(right?.position ?? 0))
    .map((item) => item?.name ?? item?.item?.name));
  const structuredCategoryValue = values(product?.category)
    .map((item) => typeof item === "object" && item ? item.name : item)
    .find((item) => clean(item, 160))
    ?? product?.additionalType;
  const structuredCategory = clean(structuredCategoryValue, 160);
  const categoryPath = visibleCategoryPath.length
    ? visibleCategoryPath
    : structuredBreadcrumbPath.length
      ? structuredBreadcrumbPath
      : structuredCategory
        ? [structuredCategory]
        : [];
  const categoryHint = categoryPath[categoryPath.length - 1] ?? null;
  const warnings = [];
  if (!name) warnings.push("პროდუქტის სახელი ვერ მოიძებნა.");
  if (!description) warnings.push("აღწერა ვერ მოიძებნა.");
  if (!imageUrls.length) warnings.push("ფოტო ვერ მოიძებნა.");
  if (!material) warnings.push("მასალის ტიპი ვერ მოიძებნა.");
  if (!weightGrams) warnings.push("წონა ვერ მოიძებნა.");
  if (!printTimeMinutes) warnings.push("ბეჭდვის დრო ვერ მოიძებნა.");
  if (!categoryHint) warnings.push("კატეგორია და ქვეკატეგორია ვერ მოიძებნა.");
  if (pageLooksTranslated && (!hasGeorgian(name) || !hasGeorgian(description))) {
    warnings.push("Chrome-ის ქართული თარგმანი ყველა ველში ვერ ამოიკითხა — სახელი და აღწერა კლიპერში გადაამოწმე.");
  }
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
      categoryPath,
      media: { imageUrls, videoUrl },
      technical: {
        material,
        weightGrams,
        printTimeMinutes,
        marginPercent: null,
        colorMode: "customer_choice",
        colors: [],
      },
    },
    warnings,
  };
})();
