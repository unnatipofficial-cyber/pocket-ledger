import { createClient } from "@supabase/supabase-js";

// Publishable Supabase credentials are safe to ship in a browser/Capacitor client;
// Row Level Security protects the transaction data. Environment variables still
// take precedence for local and hosted deployments.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://ygrddmbhfjfmozqwyamo.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_FFrT-Xph2mwxfneb8aIPAw_9Vrn5mnS";

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("your-project") &&
    !supabaseAnonKey.includes("your-anon-key"),
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
