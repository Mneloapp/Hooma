import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full bg-hooma-secondary/45 px-3 py-1 text-xs font-medium text-hooma-text", className)}>
      {children}
    </span>
  );
}
