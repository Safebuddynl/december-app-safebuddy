import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "./types";

/**
 * The shared Supabase client.
 *
 * Import it as `import { supabase } from "@/integrations/supabase/client"`.
 *
 * `types.ts` is generated from the database schema. After changing a
 * migration, regenerate it with:
 *   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
