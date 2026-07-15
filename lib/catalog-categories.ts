export type CategoryRow = {
  id: string;
  parent_id: string | null;
  slug: string;
  name_en: string;
  name_ka: string;
  sort_order?: number;
};

export type CategoryOption = {
  id: string;
  name: string;
  slug: string;
  nameEn: string;
  nameKa: string;
  parentSlug: string | null;
  parentNameEn: string | null;
  parentNameKa: string | null;
};

export function buildCategoryOptions(rows: CategoryRow[]): CategoryOption[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((row) => {
    const parent = row.parent_id ? byId.get(row.parent_id) ?? null : null;
    return {
      id: row.id,
      name: parent ? `${parent.name_ka} → ${row.name_ka}` : row.name_ka,
      slug: row.slug,
      nameEn: row.name_en,
      nameKa: row.name_ka,
      parentSlug: parent?.slug ?? null,
      parentNameEn: parent?.name_en ?? null,
      parentNameKa: parent?.name_ka ?? null,
    };
  });
}

const normalized = (value: string | null | undefined) => String(value ?? "")
  .toLocaleLowerCase("ka-GE")
  .replace(/[^a-z0-9\u10a0-\u10ff]+/g, "");

const matchesExactly = (needle: string, values: Array<string | null>) =>
  Boolean(needle) && values.some((value) => normalized(value) === needle);

const matchesLoosely = (needle: string, values: Array<string | null>) =>
  needle.length >= 4 && values.some((value) => {
    const candidate = normalized(value);
    return candidate.length >= 4 && (candidate.includes(needle) || needle.includes(candidate));
  });

export function matchCategoryOption(
  options: CategoryOption[],
  categoryPath: string[],
  categoryHint: string | null,
): CategoryOption | null {
  const path = (categoryPath.length ? categoryPath : categoryHint ? [categoryHint] : [])
    .map(normalized)
    .filter(Boolean);
  const leaf = path[path.length - 1] ?? "";
  const ancestors = path.slice(0, -1);
  if (!leaf) return null;

  let best: { option: CategoryOption; score: number } | null = null;
  for (const option of options) {
    const leafAliases = [option.nameKa, option.nameEn, option.slug];
    const parentAliases = [option.parentNameKa, option.parentNameEn, option.parentSlug];
    const fullAliases = [
      option.name,
      option.parentNameKa ? `${option.parentNameKa} ${option.nameKa}` : null,
      option.parentNameEn ? `${option.parentNameEn} ${option.nameEn}` : null,
      option.parentSlug ? `${option.parentSlug} ${option.slug}` : null,
    ];
    let score = 0;
    if (matchesExactly(leaf, leafAliases)) score += 120;
    else if (matchesLoosely(leaf, leafAliases)) score += 45;
    if (matchesExactly(path.slice(-2).join(""), fullAliases)) score += 160;
    if (ancestors.some((ancestor) => matchesExactly(ancestor, parentAliases))) score += 60;
    else if (ancestors.some((ancestor) => matchesLoosely(ancestor, parentAliases))) score += 20;
    if (option.parentSlug) score += 2;
    if (!best || score > best.score) best = { option, score };
  }

  return best && best.score >= 60 ? best.option : null;
}
