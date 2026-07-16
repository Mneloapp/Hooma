"use client";

import { useEffect, useRef, useState } from "react";
import {
  calculateCatalogPricePreviewAction,
  type CatalogPriceBreakdown,
} from "@/app/admin/catalog-pricing-actions";

export function useCatalogPricePreview({
  materialProfileId,
  pricingProfileId,
  materialGrams,
  printMinutes,
  marginPercent,
}: {
  materialProfileId: string;
  pricingProfileId: string;
  materialGrams: string | number;
  printMinutes: string | number;
  marginPercent: string | number;
}) {
  const sequence = useRef(0);
  const [data, setData] = useState<CatalogPriceBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const grams = Number(materialGrams);
    const minutes = Number(printMinutes);
    const margin = Number(marginPercent);
    const valid = Boolean(materialProfileId && pricingProfileId)
      && Number.isFinite(grams) && grams > 0
      && Number.isInteger(minutes) && minutes > 0
      && Number.isFinite(margin) && margin >= 0 && margin < 100;
    const requestNumber = sequence.current + 1;
    sequence.current = requestNumber;
    if (!valid) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }

    setData(null);
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      const result = await calculateCatalogPricePreviewAction({
        materialProfileId,
        pricingProfileId,
        materialGrams: grams,
        printMinutes: minutes,
        marginPercent: margin,
      });
      if (sequence.current !== requestNumber) return;
      setLoading(false);
      if (!result.ok) {
        setData(null);
        setError(result.message);
        return;
      }
      setData(result.data);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [materialProfileId, pricingProfileId, materialGrams, printMinutes, marginPercent]);

  return { data, loading, error };
}
