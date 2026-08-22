export function selectRandomItems<T>(items: readonly T[], count: number, random: () => number = Math.random) {
  const shuffled = [...items];
  const selectedCount = Math.min(shuffled.length, Math.max(0, Math.trunc(count)));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sample = random();
    const normalizedSample = Number.isFinite(sample) && sample >= 0 && sample < 1 ? sample : 0;
    const swapIndex = Math.floor(normalizedSample * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, selectedCount);
}

export function selectRandomCategoryProducts<T>(
  categoryProducts: Record<string, readonly T[]>,
  perCategory: number,
  random: () => number = Math.random,
) {
  return Object.fromEntries(
    Object.entries(categoryProducts).map(([category, products]) => [
      category,
      selectRandomItems(products, perCategory, random),
    ]),
  ) as Record<string, T[]>;
}
