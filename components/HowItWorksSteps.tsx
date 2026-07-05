import { Armchair, Box, PackageOpen, Sparkles } from "lucide-react";

const steps = [
  ["Choose your model", Armchair],
  ["Delivered in a compact box", Box],
  ["Open and let it expand", PackageOpen],
  ["Enjoy full-size comfort", Sparkles],
];

export function HowItWorksSteps() {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {steps.map(([label, Icon], index) => (
        <div key={label as string} className="rounded-2xl bg-white p-6">
          <div className="mb-10 flex items-center justify-between">
            <span className="text-sm text-hooma-muted">0{index + 1}</span>
            <Icon className="text-hooma-accent" size={22} />
          </div>
          <h3 className="text-lg font-semibold">{label as string}</h3>
        </div>
      ))}
    </div>
  );
}
