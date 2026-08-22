"use client";

import { Analytics } from "@vercel/analytics/next";
import { filterPublicAnalyticsEvent } from "@/lib/web-analytics";

export function WebAnalytics() {
  return <Analytics beforeSend={filterPublicAnalyticsEvent} />;
}
