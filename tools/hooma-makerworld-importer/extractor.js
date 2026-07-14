(() => {
  const IMAGE_HOST = /(^|\.)bblmw\.com$/i;
  const MATERIAL = /\b(PLA(?:\+|\s*PLUS)?|PETG|ABS|ASA|TPU|TPE|PC|PA(?:6|12)?|NYLON|PVA|HIPS)\b/i;
  const PROFILE_KEY = /(profile.?id|print.?profile.?id|model.?profile.?id|id)$/i;
  const WEIGHT_KEY = /(filament|material|total).{0,20}(weight|gram)|(^|\.)(weight|grams?)$/i;
  const TIME_KEY = /(print|printing|estimated|prediction).{0,20}(time|duration)|(^|\.)(print.?time|duration)$/i;
  const MATERIAL_KEY = /(filament|material).{0,20}(type|name)|(^|\.)(filament|material)$/i;
  const DIMENSION_KEY = /(dimension|model.?size|bounding.?box|bbox|object.?size)/i;
  const PROFILE_NAME_KEY = /(profile).{0,12}(name|title)|(^|\.)(name|title)$/i;
  const MAX_VISITS = 60000;

  const text = (value) => typeof value === "string" ? value.trim() : "";
  const finite = (value) => {
    const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round = (value, precision = 2) => {
    const factor = 10 ** precision;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  };

  function parseIds(urlValue) {
    const url = new URL(urlValue);
    const modelId = url.pathname.match(/\/models\/(\d+)/i)?.[1] ?? null;
    const profileId = url.hash.match(/profileId-(\d+)/i)?.[1]
      ?? url.searchParams.get("profileId")
      ?? null;
    return { modelId, profileId };
  }

  function walk(root, visit) {
    const seen = new WeakSet();
    const stack = [{ value: root, path: "root", depth: 0, parent: null }];
    let visits = 0;
    while (stack.length && visits < MAX_VISITS) {
      const item = stack.pop();
      visits += 1;
      visit(item);
      if (!item.value || typeof item.value !== "object" || item.depth >= 16 || seen.has(item.value)) continue;
      seen.add(item.value);
      const entries = Array.isArray(item.value)
        ? item.value.slice(0, 500).map((value, index) => [String(index), value])
        : Object.entries(item.value).slice(0, 500);
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const [key, value] = entries[index];
        stack.push({ value, path: `${item.path}.${key}`, depth: item.depth + 1, parent: item.value });
      }
    }
  }

  function flatten(root) {
    const values = [];
    walk(root, ({ value, path, parent }) => {
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) values.push({ path, value, parent });
    });
    return values;
  }

  function profileCandidates(roots, profileId) {
    const exact = [];
    const generic = [];
    roots.forEach((root) => walk(root, ({ value, path }) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const entries = Object.entries(value);
      const serializedKeys = entries.map(([key]) => key).join(" ");
      const score = [WEIGHT_KEY, TIME_KEY, MATERIAL_KEY, DIMENSION_KEY]
        .reduce((total, pattern) => total + (pattern.test(serializedKeys) ? 1 : 0), 0);
      if (score >= 2) generic.push({ value, path, score });
      if (profileId && entries.some(([key, entry]) => PROFILE_KEY.test(key) && String(entry) === String(profileId))) {
        exact.push({ value, path, score: score + 10 });
      }
    }));
    return (exact.length ? exact : generic).sort((a, b) => b.score - a.score).map((item) => item.value);
  }

  function parseWeight(value, path) {
    const numeric = finite(value);
    if (numeric === null || numeric <= 0) return null;
    const raw = String(value).toLowerCase();
    if (/\bkg\b|kilogram/.test(raw) || /kilogram|weight.?kg/.test(path)) return round(numeric * 1000);
    if (/\bmg\b|milligram/.test(raw)) return round(numeric / 1000);
    return round(numeric);
  }

  function parseMinutes(value, path) {
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      const hours = finite(normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hour)/)?.[1]) ?? 0;
      const minutes = finite(normalized.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute)/)?.[1]) ?? 0;
      const seconds = finite(normalized.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|second)/)?.[1]) ?? 0;
      if (hours || minutes || seconds) return Math.max(1, Math.round(hours * 60 + minutes + seconds / 60));
      if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(normalized)) {
        const parts = normalized.split(":").map(Number);
        return parts.length === 3 ? Math.max(1, Math.round(parts[0] * 60 + parts[1] + parts[2] / 60)) : Math.max(1, Math.round(parts[0] + parts[1] / 60));
      }
    }
    const numeric = finite(value);
    if (numeric === null || numeric <= 0) return null;
    if (/millisecond|_ms|\.ms$/i.test(path)) return Math.max(1, Math.round(numeric / 60000));
    if (/second|_sec|_seconds|\.seconds$/i.test(path) || numeric > 1000) return Math.max(1, Math.round(numeric / 60));
    return Math.max(1, Math.round(numeric));
  }

  function findByPath(flat, pattern, parser) {
    for (const entry of flat) {
      if (!pattern.test(entry.path)) continue;
      const result = parser(entry.value, entry.path, entry.parent);
      if (result !== null && result !== "" && result !== undefined) return { value: result, path: entry.path };
    }
    return null;
  }

  function findMaterial(flat, bodyText) {
    const byKey = findByPath(flat, MATERIAL_KEY, (value) => text(value).match(MATERIAL)?.[1]?.toUpperCase() ?? null);
    if (byKey) return byKey;
    const nearby = bodyText.match(/(?:material|filament)[^\n]{0,60}\b(PLA(?:\+|\s*PLUS)?|PETG|ABS|ASA|TPU|TPE|PC|PA6|PA12|NYLON|PVA|HIPS)\b/i);
    return nearby?.[1] ? { value: nearby[1].toUpperCase(), path: "document.visible_text" } : null;
  }

  function findDimensions(roots, flat, bodyText) {
    let result = null;
    roots.some((root) => {
      walk(root, ({ value, path }) => {
        if (result || !value || typeof value !== "object" || Array.isArray(value) || !DIMENSION_KEY.test(path)) return;
        const lower = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key.toLowerCase(), entry]));
        const x = finite(lower.x ?? lower.width ?? lower.sizex ?? lower.size_x);
        const y = finite(lower.y ?? lower.depth ?? lower.sizey ?? lower.size_y);
        const z = finite(lower.z ?? lower.height ?? lower.sizez ?? lower.size_z);
        if (x && y && z && x > 0 && y > 0 && z > 0) result = { x: round(x), y: round(y), z: round(z), unit: "mm", path };
      });
      return Boolean(result);
    });
    if (result) return result;

    const keyed = findByPath(flat, DIMENSION_KEY, (value) => {
      const match = text(value).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm)?/i);
      if (!match) return null;
      const scale = match[4]?.toLowerCase() === "cm" ? 10 : 1;
      return { x: round(Number(match[1]) * scale), y: round(Number(match[2]) * scale), z: round(Number(match[3]) * scale), unit: "mm" };
    });
    if (keyed) return { ...keyed.value, path: keyed.path };

    const visible = bodyText.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/i);
    if (!visible) return null;
    const scale = visible[4].toLowerCase() === "cm" ? 10 : 1;
    return { x: round(Number(visible[1]) * scale), y: round(Number(visible[2]) * scale), z: round(Number(visible[3]) * scale), unit: "mm", path: "document.visible_text" };
  }

  function validImage(value) {
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" && IMAGE_HOST.test(url.hostname) && /\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url.pathname + url.search)
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  function collectImages(roots) {
    const images = [];
    const add = (value) => {
      const image = validImage(value);
      if (image && !images.includes(image) && images.length < 12) images.push(image);
    };
    document.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach((node) => add(node.content));
    document.querySelectorAll("img").forEach((node) => {
      add(node.currentSrc || node.src);
      String(node.srcset ?? "").split(",").forEach((item) => add(item.trim().split(/\s+/)[0]));
    });
    roots.forEach((root) => walk(root, ({ value }) => { if (typeof value === "string") add(value); }));
    return images;
  }

  function scriptRoots() {
    const roots = [];
    document.querySelectorAll('script[type="application/ld+json"],script#__NEXT_DATA__').forEach((node) => {
      const content = node.textContent?.trim();
      if (!content || content.length > 2 * 1024 * 1024) return;
      try { roots.push(JSON.parse(content)); } catch { /* Ignore non-JSON script content. */ }
    });
    return roots;
  }

  function extract(capturedResponses = []) {
    const sourceUrl = window.location.href;
    const { modelId, profileId } = parseIds(sourceUrl);
    const capturedRoots = capturedResponses.map((item) => item?.payload).filter((item) => item && typeof item === "object");
    const allRoots = [...scriptRoots(), ...capturedRoots];
    const profiles = profileCandidates(allRoots, profileId);
    const selectedRoots = profiles.length ? [profiles[0], ...allRoots] : allRoots;
    const flat = flatten(selectedRoots);
    const visibleText = document.body?.innerText ?? "";

    const title = document.querySelector('meta[property="og:title"]')?.content
      || document.querySelector('meta[name="twitter:title"]')?.content
      || document.querySelector("h1")?.textContent
      || document.title.replace(/\s*[-|]\s*MakerWorld.*$/i, "")
      || "";
    const description = document.querySelector('meta[property="og:description"]')?.content
      || document.querySelector('meta[name="description"]')?.content
      || "";
    const material = findMaterial(flat, visibleText);
    const weight = findByPath(flat, WEIGHT_KEY, parseWeight)
      ?? (() => {
        const match = visibleText.match(/(?:filament|material|weight)[^\n]{0,60}(\d+(?:\.\d+)?)\s*(g|kg)\b/i);
        return match ? { value: match[2].toLowerCase() === "kg" ? round(Number(match[1]) * 1000) : round(Number(match[1])), path: "document.visible_text" } : null;
      })();
    const printTime = findByPath(flat, TIME_KEY, parseMinutes)
      ?? (() => {
        const match = visibleText.match(/(?:print(?:ing)?\s*time|duration)[^\n]{0,80}((?:\d+(?:\.\d+)?\s*(?:h|hr|hour|m|min|minute|s|sec|second)\s*)+)/i);
        return match ? { value: parseMinutes(match[1], "document.visible_text"), path: "document.visible_text" } : null;
      })();
    const dimensions = findDimensions(selectedRoots, flat, visibleText);
    const profileName = findByPath(flat, PROFILE_NAME_KEY, (value, path) => /profile/i.test(path) && text(value).length < 200 ? text(value) : null);
    const images = collectImages(allRoots);

    const missing = [];
    if (!images.length) missing.push("images");
    if (!material?.value) missing.push("material");
    if (!weight?.value) missing.push("material_grams");
    if (!printTime?.value) missing.push("print_minutes");
    if (!dimensions) missing.push("dimensions");

    return {
      schema: "hooma-makerworld-import-v1",
      extracted_at: new Date().toISOString(),
      source_url: sourceUrl,
      model_id: modelId,
      profile_id: profileId,
      profile_name: profileName?.value ?? null,
      title: text(title).slice(0, 240),
      description: text(description).slice(0, 3000),
      images,
      material: material?.value ?? null,
      material_grams: weight?.value ?? null,
      print_minutes: printTime?.value ?? null,
      dimensions: dimensions ? { x: dimensions.x, y: dimensions.y, z: dimensions.z, unit: "mm" } : null,
      missing,
      evidence: {
        material: material?.path ?? null,
        material_grams: weight?.path ?? null,
        print_minutes: printTime?.path ?? null,
        dimensions: dimensions?.path ?? null,
        captured_response_count: capturedRoots.length,
      },
    };
  }

  globalThis.HoomaMakerWorldExtractor = { extract };
})();
