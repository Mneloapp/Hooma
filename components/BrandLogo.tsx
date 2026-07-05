import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  markOnly?: boolean;
  inverted?: boolean;
};

export function BrandLogo({ className, imageClassName, markOnly = false, inverted = false }: BrandLogoProps) {
  return (
    <Link href="/" aria-label="Hooma home" className={cn("inline-flex items-center", className)}>
      <Image
        src={markOnly ? "/brand/hooma-symbol.png" : "/brand/hooma-logo.png"}
        alt="Hooma"
        width={markOnly ? 516 : 552}
        height={markOnly ? 431 : 462}
        priority
        className={cn("h-auto w-full object-contain", inverted && "invert", imageClassName)}
      />
    </Link>
  );
}
