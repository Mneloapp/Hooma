export const productColorOptions = [
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
] as const;

export const productColorNames = productColorOptions.map((color) => color.name);
export const fixedMulticolorLabel = "მრავალფერიანი — როგორც ფოტოზე";

const legacyColors: Record<string, string> = {
  "Warm white": "#EEEAE1",
  Graphite: "#292929",
  Sage: "#7B8B68",
  Sand: "#D8C7AD",
  Terracotta: "#B96F50",
};

export function productColorHex(name: string) {
  return productColorOptions.find((color) => color.name === name)?.hex ?? legacyColors[name] ?? "#D8C7AD";
}
