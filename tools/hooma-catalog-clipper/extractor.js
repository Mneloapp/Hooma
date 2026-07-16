(async () => {
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

  async function makerWorldProfileTechnical() {
    const isMakerWorld = /(^|\.)makerworld\.com(?:\.cn)?$/i.test(location.hostname);
    const modelId = location.pathname.match(/\/models\/(\d+)/i)?.[1];
    if (!isMakerWorld || !modelId) return null;

    try {
      const response = await fetch(`${location.origin}/api/v1/design-service/design/${modelId}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const raw = await response.json();
      const design = raw?.data?.instances ? raw.data : raw?.result?.instances ? raw.result : raw;
      const instances = Array.isArray(design?.instances) ? design.instances : [];
      if (!instances.length) return null;

      const requestedProfileId = location.hash.match(/profileId-(\d+)/i)?.[1]
        ?? new URLSearchParams(location.search).get("profileId");
      const selected = instances.find((instance) => requestedProfileId
        && [instance?.profileId, instance?.id].some((value) => String(value) === requestedProfileId))
        ?? instances.find((instance) => String(instance?.id) === String(design?.defaultInstanceId))
        ?? instances.find((instance) => instance?.isDefault === true || instance?.is_default === true)
        ?? instances[0];
      if (!selected) return null;

      const modelInfo = selected?.extention?.modelInfo
        ?? selected?.extension?.modelInfo
        ?? selected?.modelInfo
        ?? {};
      const plates = Array.isArray(modelInfo?.plates) ? modelInfo.plates : [];
      const plateSum = (field) => {
        const amounts = plates.map((plate) => number(plate?.[field])).filter(Boolean);
        return amounts.length ? amounts.reduce((total, amount) => total + amount, 0) : null;
      };
      const filaments = [
        ...(Array.isArray(selected?.instanceFilaments) ? selected.instanceFilaments : []),
        ...(Array.isArray(modelInfo?.filaments) ? modelInfo.filaments : []),
        ...plates.flatMap((plate) => Array.isArray(plate?.filaments) ? plate.filaments : []),
      ];
      const materialTotals = new Map();
      filaments.forEach((filament) => {
        const rawMaterial = clean(filament?.type ?? filament?.material ?? filament?.name, 120);
        const material = clean(rawMaterial?.match(MATERIAL_PATTERN)?.[1]?.toUpperCase() ?? rawMaterial?.toUpperCase(), 120);
        if (!material) return;
        const grams = number(filament?.usedG ?? filament?.used_g ?? filament?.weight ?? filament?.grams) ?? 0.01;
        materialTotals.set(material, (materialTotals.get(material) ?? 0) + grams);
      });
      const material = Array.from(materialTotals.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
      const filamentWeight = filaments
        .map((filament) => number(filament?.usedG ?? filament?.used_g ?? filament?.weight ?? filament?.grams))
        .filter(Boolean)
        .reduce((total, grams) => total + grams, 0);
      const weightGrams = number(selected?.weight)
        ?? number(modelInfo?.weight)
        ?? plateSum("weight")
        ?? (filamentWeight > 0 ? filamentWeight : null);
      const predictionSeconds = number(selected?.prediction)
        ?? number(modelInfo?.prediction)
        ?? plateSum("prediction");

      return {
        material,
        weightGrams: weightGrams ? round(weightGrams) : null,
        printTimeMinutes: predictionSeconds ? Math.max(1, Math.round(predictionSeconds / 60)) : null,
      };
    } catch {
      return null;
    }
  }

  const makerWorldTechnical = await makerWorldProfileTechnical();

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

  const technicalSnippets = Array.from(new Set(Array.from(document.querySelectorAll([
    'main [class*="profile" i]', 'main [class*="print" i]', 'main [class*="filament" i]',
    'main [class*="material" i]', 'main [class*="parameter" i]', 'main [class*="stat" i]',
    'main [data-testid*="profile" i]', 'main [data-testid*="print" i]',
  ].join(",")))
    .map((element) => visibleText(element, 500))
    .filter(Boolean))).slice(0, 250);
  const technicalText = technicalSnippets.join("\n");
  const materialText = [
    product?.material,
    product?.additionalProperty && JSON.stringify(product.additionalProperty).slice(0, 10000),
    bodyText.match(/(?:material|filament|მასალა|ფილამენტი|ძაფი)[^\n]{0,160}/i)?.[0],
    technicalText.match(MATERIAL_PATTERN)?.[0],
    bodyText.match(MATERIAL_PATTERN)?.[0],
  ].filter(Boolean).join(" ");
  const material = makerWorldTechnical?.material
    ?? clean(materialText.match(MATERIAL_PATTERN)?.[1]?.toUpperCase(), 120);

  const weightSource = `${technicalText}\n${bodyText}`;
  const weightMatch = weightSource.match(/(?:model\s*weight|material\s*(?:used|weight)|filament(?:\s*used)?|weight|მოდელის\s*წონა|მასალის\s*წონა|გამოყენებული\s*მასალა|ფილამენტის\s*წონა|წონა)[^\n\r\d]{0,80}?(\d+(?:[.,]\d+)?)\s*(kg|kgs?|kilograms?|g|grams?|კგ|კილოგრამ(?:ი|ები)?|გ|გრ|გრამ(?:ი|ები)?)(?=$|[^A-Za-z\u10a0-\u10ff])/i)
    ?? technicalText.match(/(\d+(?:[.,]\d+)?)\s*(kg|kgs?|kilograms?|g|grams?|კგ|კილოგრამ(?:ი|ები)?|გ|გრ|გრამ(?:ი|ები)?)(?=$|[^A-Za-z\u10a0-\u10ff])/i);
  let weightGrams = makerWorldTechnical?.weightGrams ?? number(weightMatch?.[1]);
  const weightUnit = weightMatch?.[2]?.toLocaleLowerCase("ka-GE") ?? "";
  if (!makerWorldTechnical?.weightGrams && weightGrams && /^(?:kg|kgs|kilogram|kilograms|კგ|კილოგრამ)/i.test(weightUnit)) weightGrams *= 1000;
  if (weightGrams) weightGrams = round(weightGrams);

  const timeSource = `${technicalText}\n${bodyText}`;
  const timeText = timeSource.match(/(?:print(?:ing)?\s*(?:time|duration)|estimated\s*time|print\s*duration|ბეჭდვის\s*(?:დრო|ხანგრძლივობა)|დამზადების\s*დრო|სავარაუდო\s*დრო)[^\n\r]{0,160}/i)?.[0]
    ?? technicalSnippets.find((snippet) => /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours|სთ|საათი|საათები)(?=$|[^A-Za-z\u10a0-\u10ff])/i.test(snippet))
    ?? "";
  const timeHours = number(timeText.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours|სთ|საათი|საათები)(?=$|[^A-Za-z\u10a0-\u10ff])/i)?.[1]) ?? 0;
  const timeMinutes = number(timeText.match(/(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minute|minutes|წთ|წუთი|წუთები)(?=$|[^A-Za-z\u10a0-\u10ff])/i)?.[1]) ?? 0;
  let printTimeMinutes = makerWorldTechnical?.printTimeMinutes
    ?? (timeHours || timeMinutes ? Math.max(1, Math.round(timeHours * 60 + timeMinutes)) : null);
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
  const catalogTaxonomy = [
    { ka: "3D პრინტერი", en: "3D Printer", children: [
      ["3D პრინტერის აქსესუარები", "3D Printer Accessories"],
      ["3D პრინტერის ნაწილები", "3D Printer Parts"],
      ["სატესტო მოდელები", "Test Models", "Calibration Models"],
    ] },
    { ka: "ხელოვნება", en: "Art", children: [
      ["2D ხელოვნება", "2D Art"],
      ["მონეტები და სამკერდე ნიშნები", "Coins & Badges", "Coins and Badges"],
      ["ნიშნები და ლოგოები", "Signs & Logos", "Signs and Logos"],
      ["ქანდაკებები", "Sculptures"],
      ["სხვა ხელოვნების მოდელები", "Other Art Models", "Other Art"],
    ] },
    { ka: "განათლება", en: "Education", children: [
      ["ბიოლოგია", "Biology"], ["ქიმია", "Chemistry"], ["ინჟინერია", "Engineering"],
      ["გეოგრაფია", "Geography"], ["მათემატიკა", "Mathematics", "Math"],
      ["ფიზიკა და ასტრონომია", "Physics & Astronomy", "Physics and Astronomy"],
      ["სხვა საგანმანათლებლო მოდელები", "Other Educational Models", "Other Education Models"],
    ] },
    { ka: "მოდა", en: "Fashion", children: [
      ["ჩანთები", "Bags"], ["ტანსაცმელი", "Clothing"], ["საყურეები", "Earrings"],
      ["ფეხსაცმელი", "Footwear", "Shoes"], ["სათვალე", "Glasses", "Eyewear"],
      ["სამკაულები", "Jewelry", "Jewellery"], ["ბეჭდები", "Rings"],
      ["სხვა მოდის მოდელები", "Other Fashion Models", "Other Fashion"],
    ] },
    { ka: "ჰობი და საკუთარი ხელით კეთება", en: "Hobby & DIY", aliases: ["Hobbies & DIY", "Hobby and DIY"], children: [
      ["ელექტრონიკა", "Electronics"], ["მუსიკა", "Music"], ["RC", "RC"], ["რობოტიკა", "Robotics"],
      ["სპორტი და ღია ცის ქვეშ", "Sports & Outdoors", "Sport & Outdoors", "Sports and Outdoors"],
      ["მანქანები", "Vehicles"],
      ["სხვა ჰობი და საკუთარი ხელით კეთების მოდელები", "Other Hobby & DIY Models", "Other Hobbies & DIY"],
    ] },
    { ka: "საყოფაცხოვრებო", en: "Household", children: [
      ["დეკორი", "Decor", "Decoration"], ["დღესასწაულები", "Holidays", "Holiday", "Festivals"],
      ["ბაღი", "Garden"], ["ოფისი", "Office"], ["შინაური ცხოველები", "Pets"],
      ["სხვა სახლის მოდელები", "Other Household Models", "Other House Models", "Other Household"],
    ] },
    { ka: "მინიატურები", en: "Miniatures", children: [
      ["ცხოველები", "Animals"], ["არქიტექტურა", "Architecture"], ["არსებები", "Creatures"],
      ["ხალხი", "People"], ["სხვა მინიატურები", "Other Miniatures"],
    ] },
    { ka: "რეკვიზიტები და კოსფლეი", en: "Props & Cosplay", aliases: ["Props and Cosplay"], children: [
      ["კოსტიუმები", "Costumes"], ["ნიღბები და ჩაფხუტები", "Masks & Helmets", "Masks and Helmets"],
      ["კოსფლეის იარაღები", "Cosplay Weapons"],
      ["სხვა რეკვიზიტები და კოსფლეი", "Other Props & Cosplay", "Other Props and Cosplay"],
    ] },
    { ka: "ხელსაწყოები", en: "Tools", children: [
      ["გაჯეტები", "Gadgets"], ["ხელის ხელსაწყოები", "Hand Tools"],
      ["ჩარჩოები", "Fixtures", "Jigs & Fixtures", "Jigs and Fixtures"],
      ["საზომი ინსტრუმენტები", "Measuring Tools", "Measurement Tools"],
      ["სამედიცინო ინსტრუმენტები", "Medical Instruments", "Medical Tools"],
      ["ორგანიზატორები", "Organizers", "Organisers"], ["სხვა ინსტრუმენტები", "Other Tools"],
    ] },
    { ka: "სათამაშოები და თამაშები", en: "Toys & Games", aliases: ["Toys and Games"], children: [
      ["სამაგიდო თამაშები", "Board Games"], ["პერსონაჟები", "Characters"],
      ["გარე სათამაშოები", "Outdoor Toys"], ["თავსატეხები", "Puzzles"],
      ["სამშენებლო ნაკრებები", "Construction Sets", "Building Sets"],
      ["სხვა სათამაშოები და თამაშები", "Other Toys & Games", "Other Toys and Games"],
    ] },
    { ka: "გენერაციული 3D მოდელი", en: "Generative 3D Model", children: [] },
  ];
  const taxonomyEntries = catalogTaxonomy.flatMap((parent) => [
    {
      parentKa: parent.ka,
      childKa: null,
      keys: [parent.ka, parent.en, ...(parent.aliases ?? [])].map(categoryKey),
    },
    ...parent.children.map(([childKa, ...aliases]) => ({
      parentKa: parent.ka,
      childKa,
      keys: [childKa, ...aliases].map(categoryKey),
    })),
  ]);
  const taxonomyMatch = (value) => {
    const label = clean(value, 300)?.replace(/\s*[([]\d+[)\]]\s*$/, "");
    const key = categoryKey(label);
    if (!key) return null;
    return taxonomyEntries.find((entry) => entry.keys.includes(key)) ?? null;
  };
  const canonicalTaxonomyPath = (items) => {
    const matches = items.flatMap((item) => String(item ?? "")
      .split(/\s*(?:→|›|>|\/|\||•)\s*/)
      .map(taxonomyMatch)
      .filter(Boolean));
    const child = matches.findLast((match) => match.childKa);
    if (child) return [child.parentKa, child.childKa];
    const parent = matches.findLast((match) => !match.childKa);
    return parent ? [parent.parentKa] : [];
  };
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

  // Product pages do not always render a formal breadcrumb. Scan visible
  // category links/chips against Hooma's exact taxonomy as a second source.
  // Canonical Georgian labels make the exported package independent of the
  // page language and deterministic for the Admin category matcher.
  const visibleTaxonomyCandidates = [];
  const categoryCandidateSelectors = [
    'main a', 'main button', 'main [role="link"]', 'main li',
    'main [class*="category" i]', 'main [class*="tag" i]',
    '[data-testid*="category" i]', '[data-test*="category" i]',
    '[aria-label*="category" i]', '[itemprop="category" i]',
    'a[href*="category" i]', 'a[href*="catalog" i]',
  ];
  const candidateElements = new Set();
  categoryCandidateSelectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => candidateElements.add(element));
  });
  Array.from(candidateElements).slice(0, 12000).forEach((element) => {
    const label = visibleText(element, 300);
    const candidatePath = canonicalTaxonomyPath([label]);
    if (!candidatePath.length) return;
    const match = { parentKa: candidatePath[0], childKa: candidatePath[1] ?? null };
    const context = [
      element.getAttribute("href"), element.getAttribute("class"), element.getAttribute("id"),
      element.getAttribute("data-testid"), element.getAttribute("data-test"), element.getAttribute("aria-label"),
      element.parentElement?.getAttribute("class"),
    ].filter(Boolean).join(" ");
    let score = match.childKa ? 120 : 50;
    if (/category|categor|taxonomy|breadcrumb/i.test(context)) score += 100;
    if (/tag|chip|label/i.test(context)) score += 45;
    if (element.matches("a, button, [role=link]")) score += 25;
    if (element.closest("header, footer")) score -= 120;
    visibleTaxonomyCandidates.push({ match, score });
  });
  visibleTaxonomyCandidates.sort((left, right) => right.score - left.score);
  const visibleTaxonomyMatch = visibleTaxonomyCandidates[0]?.match ?? null;
  const visibleTaxonomyPath = visibleTaxonomyMatch
    ? [visibleTaxonomyMatch.parentKa, visibleTaxonomyMatch.childKa].filter(Boolean)
    : [];
  const labelledCategoryPaths = Array.from(bodyText.matchAll(
    /(?:^|\n)\s*(?:category|categories|კატეგორია|კატეგორიები)\s*:?\s*(?:\n\s*)?([^\n]{1,240})/gim,
  )).map((match) => canonicalTaxonomyPath([match[1]])).filter((path) => path.length);
  const labelledCategoryPath = labelledCategoryPaths.find((path) => path.length > 1)
    ?? labelledCategoryPaths[0]
    ?? [];

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
  const metadataCategoryValues = Array.from(document.querySelectorAll(
    'meta[name="keywords" i], meta[property="article:tag" i], meta[name*="category" i], meta[property*="category" i]',
  )).flatMap((element) => String(element.getAttribute("content") ?? "").split(/[,;|]/));
  const canonicalBreadcrumbPath = canonicalTaxonomyPath(visibleCategoryPath);
  const canonicalStructuredPath = canonicalTaxonomyPath([
    ...structuredBreadcrumbPath,
    structuredCategory,
    ...metadataCategoryValues,
  ]);
  const categoryPath = canonicalBreadcrumbPath.length
    ? canonicalBreadcrumbPath
    : canonicalStructuredPath.length
      ? canonicalStructuredPath
      : labelledCategoryPath.length
        ? labelledCategoryPath
        : visibleTaxonomyPath.length
          ? visibleTaxonomyPath
          : visibleCategoryPath.length
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
