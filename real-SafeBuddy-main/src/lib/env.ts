/**
 * Single place where environment variables are read.
 *
 * Vite only exposes variables prefixed with `VITE_`, and it inlines them at
 * build time. Reading them here (instead of sprinkling `import.meta.env`
 * through components) means a rename only has to happen once, and missing
 * config produces one clear warning instead of a silent broken feature.
 */

const read = (key: string): string => {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return typeof value === "string" ? value.trim() : "";
};

/**
 * Supabase publishes one anonymous key. It has been named both
 * `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_ANON_KEY` in this
 * project's `.env` files, so accept either and prefer the newer name.
 */
export const SUPABASE_URL = read("VITE_SUPABASE_URL");
export const SUPABASE_ANON_KEY =
  read("VITE_SUPABASE_PUBLISHABLE_KEY") || read("VITE_SUPABASE_ANON_KEY");
export const MAPBOX_TOKEN = read("VITE_MAPBOX_TOKEN");

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const isMapboxConfigured = () => Boolean(MAPBOX_TOKEN);

/** Warn once, at startup, about anything missing. */
export function warnAboutMissingEnv(): void {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!MAPBOX_TOKEN) missing.push("VITE_MAPBOX_TOKEN (map falls back to OpenStreetMap)");

  if (missing.length > 0) {
    console.warn(
      `[SafeBuddy] Missing environment variables: ${missing.join(", ")}.\n` +
        "Copy .env.local.example to .env.local, fill it in, and restart the dev server."
    );
  }
}
