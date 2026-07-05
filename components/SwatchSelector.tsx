"use client";

import { cn } from "@/lib/utils";

const swatches: Record<string, string> = {
  Ivory: "#E8E1D5",
  Stone: "#9B978F",
  Moss: "#6F7D5C",
  Charcoal: "#292929",
  Cocoa: "#7B6657",
};

export function SwatchSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const colorMode = label.toLowerCase().includes("color");

  return (
    <div>
      <p className="mb-3 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm transition",
              value === option ? "border-hooma-accent bg-hooma-accent/10" : "border-hooma-text/10 bg-white hover:border-hooma-accent/50",
            )}
          >
            {colorMode ? <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: swatches[option] ?? "#D8C7AD" }} /> : null}
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
