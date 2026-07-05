"use client";

import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "./config";
import type { Database } from "./types";

export function createClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
