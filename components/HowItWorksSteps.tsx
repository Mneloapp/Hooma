import { Armchair, Box, PackageOpen, Sparkles } from "lucide-react";

const steps = [
  ["Choose your model", "Pick the sofa, lounger, ottoman, or pet piece that fits your room.", Armchair],
  ["Delivered in a compact box", "Your selected model is packed for easier movement through doors and elevators.", Box],
  ["Open and let it expand", "Unpack it in the room, give it time to recover shape, and position it where it belongs.", PackageOpen],
  ["Enjoy full-size comfort", "Settle into generous proportions without the usual delivery friction.", Sparkles],
];

export function HowItWorksSteps({ detailed = false }: { detailed?: boolean }) {
  return (
    <div className={detailed ? "grid gap-4 md:grid-cols-2 lg:grid-cols-4" : "grid gap-4 md:grid-cols-4"}>
      {steps.map(([label, copy, Icon], index) => (
        <div key={label as string} className="rounded-2xl bg-white p-6">
          <div className="mb-10 flex items-center justify-between">
            <span className="text-sm text-hooma-muted">0{index + 1}</span>
            <Icon className="text-hooma-accent" size={22} />
          </div>
          <h3 className="text-lg font-semibold">{label as string}</h3>
          {detailed ? <p className="mt-3 text-sm leading-6 text-hooma-muted">{copy as string}</p> : null}
        </div>
      ))}
    </div>
  );
}
