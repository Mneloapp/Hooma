import "server-only";

import { createClient } from "@supabase/supabase-js";
import { resolveStorefrontSitemapConfig } from "@/lib/storefront-sitemap";

const SITEMAP_CLIENT_ERROR = "STOREFRONT_SITEMAP_CLIENT_INITIALIZATION_FAILED";

export function createSitemapCatalogClient() {
  const { supabaseUrl, secretKey } = resolveStorefrontSitemapConfig(process.env);

  try {
    return createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  } catch {
    throw new Error(SITEMAP_CLIENT_ERROR);
  }
}
