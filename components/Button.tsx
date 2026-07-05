import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Props = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  href?: string;
} & ButtonHTMLAttributes<HTMLButtonElement> &
  AnchorHTMLAttributes<HTMLAnchorElement>;

export function Button({ children, variant = "primary", className, href, ...props }: Props) {
  const classes = cn(
    "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition duration-300 focus:outline-none focus:ring-2 focus:ring-hooma-accent/30 active:scale-[0.98]",
    variant === "primary" && "bg-hooma-text text-white hover:-translate-y-0.5 hover:bg-hooma-accent hover:shadow-soft",
    variant === "secondary" && "border border-hooma-text/15 bg-white/55 text-hooma-text hover:-translate-y-0.5 hover:border-hooma-accent hover:text-hooma-accent",
    variant === "ghost" && "text-hooma-text hover:text-hooma-accent",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
