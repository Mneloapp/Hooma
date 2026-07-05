"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export function ProductImageGallery({ images, name }: { images: string[]; name: string }) {
  const uniqueImages = useMemo(() => Array.from(new Set(images)).filter(Boolean), [images]);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const hasMultiple = uniqueImages.length > 1;

  const goTo = (index: number) => {
    if (!uniqueImages.length) return;
    setActive((index + uniqueImages.length) % uniqueImages.length);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") goTo(active + 1);
      if (event.key === "ArrowLeft") goTo(active - 1);
      if (event.key === "Escape") setLightboxOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  const handleTouchEnd = (x: number) => {
    if (touchStart === null || !hasMultiple) return;
    const delta = touchStart - x;
    if (Math.abs(delta) > 36) goTo(active + (delta > 0 ? 1 : -1));
    setTouchStart(null);
  };

  return (
    <div>
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-hooma-panel"
        onTouchStart={(event) => setTouchStart(event.changedTouches[0].clientX)}
        onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0].clientX)}
      >
        <button
          type="button"
          aria-label={hasMultiple ? "Show next product image" : undefined}
          onClick={() => hasMultiple && goTo(active + 1)}
          className={cn("relative h-full w-full", hasMultiple && "cursor-pointer")}
        >
          <Image
            src={uniqueImages[active]}
            alt={`${name} image ${active + 1}`}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 55vw, 100vw"
          />
        </button>
        <button
          type="button"
          aria-label="Open large image"
          onClick={() => setLightboxOpen(true)}
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/85 text-hooma-text shadow-sm transition hover:bg-white"
        >
          <Maximize2 size={18} />
        </button>
        {hasMultiple ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => goTo(active - 1)}
              className="absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-hooma-text shadow-sm transition hover:bg-white"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => goTo(active + 1)}
              className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-hooma-text shadow-sm transition hover:bg-white"
            >
              <ChevronRight size={20} />
            </button>
          </>
        ) : null}
      </div>
      {hasMultiple ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
          {uniqueImages.map((image, index) => (
            <button
              type="button"
              key={image}
              aria-label={`Show ${name} image ${index + 1}`}
              onClick={() => goTo(index)}
              className={cn(
                "relative h-24 w-32 shrink-0 overflow-hidden rounded-xl border bg-hooma-panel transition",
                active === index ? "border-hooma-accent" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image src={image} alt={`${name} thumbnail ${index + 1}`} fill className="object-cover" sizes="128px" />
            </button>
          ))}
        </div>
      ) : null}
      {lightboxOpen ? (
        <div className="fixed inset-0 z-50 bg-hooma-text/92 p-4 backdrop-blur-md">
          <button
            type="button"
            aria-label="Close large image"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-5 top-5 z-10 grid h-11 w-11 place-items-center rounded-full bg-white text-hooma-text"
          >
            <X size={20} />
          </button>
          <div className="relative h-full w-full">
            <Image src={uniqueImages[active]} alt={`${name} large image ${active + 1}`} fill className="object-contain" sizes="100vw" />
          </div>
          {hasMultiple ? (
            <>
              <button
                type="button"
                aria-label="Previous large image"
                onClick={() => goTo(active - 1)}
                className="absolute left-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-hooma-text"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                aria-label="Next large image"
                onClick={() => goTo(active + 1)}
                className="absolute right-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white text-hooma-text"
              >
                <ChevronRight size={20} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
