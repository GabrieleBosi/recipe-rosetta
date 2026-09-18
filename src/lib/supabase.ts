import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

/** Set when the build has no Supabase configuration. The UI shows it. */
export const supabaseConfigError = url && publishableKey
  ? null
  : "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. See .env.example.";

export const SCANS_BUCKET = "recipe-scans";

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  publishableKey ?? "placeholder",
  { auth: { persistSession: true, autoRefreshToken: true } },
);
