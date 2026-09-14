import { supabase } from "@/integrations/supabase/client";

/**
 * Which reports the current user has already liked, so the like button can
 * show that state from the start.
 *
 * Read-only. Returns an empty set when nobody is logged in or the read fails;
 * the button then simply starts unfilled, and liking still works as before.
 */

/** Same value `toggleReportLike` stores in `report_likes.report_source`. */
const LIKE_SOURCE = "safety_reports";

export async function fetchLikedReportIds(): Promise<Set<string>> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return new Set();

  const { data, error } = await supabase
    .from("report_likes")
    .select("report_id")
    .eq("user_id", user.id)
    .eq("report_source", LIKE_SOURCE);

  if (error) {
    console.warn("[SafeBuddy] Could not load liked reports:", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((row) => String(row.report_id)));
}
