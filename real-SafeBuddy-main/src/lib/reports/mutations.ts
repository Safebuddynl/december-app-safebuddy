import { supabase } from "@/integrations/supabase/client";
import type { LatLng } from "@/lib/geo";
import type { SafetyReport, Severity } from "./types";

/**
 * Writes against community reports: creating, liking and deleting.
 *
 * Only rows in `safety_reports` can be changed. The imported historic dataset
 * is read-only, so `canLike` / `canDelete` gate the UI instead of letting the
 * request fail after the user has already clicked.
 */

/** The value stored in `report_likes.report_source` for community reports. */
const LIKE_SOURCE = "safety_reports";

export function canLike(report: SafetyReport): boolean {
  return report.source === "safety_reports";
}

export function canDelete(report: SafetyReport, currentUserId: string | null): boolean {
  return report.source === "safety_reports" && !!currentUserId && report.userId === currentUserId;
}

export interface NewSafetyReport {
  point: LatLng;
  address: string;
  reportType: string;
  severity: Severity;
  description?: string;
  timeOfDay?: string | null;
}

/**
 * Store a new community report and return it in the shape the map uses.
 *
 * Writes the same columns as `ReportLocationDialog`, including the PostGIS
 * `location` point, so both entry points produce identical rows.
 */
export async function createSafetyReport(input: NewSafetyReport): Promise<SafetyReport> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("not-authenticated");

  const description = input.description?.trim() ?? "";
  const timeOfDay = input.timeOfDay ?? null;

  const { data, error } = await supabase
    .from("safety_reports")
    .insert({
      user_id: user.id,
      location_address: input.address,
      // PostGIS expects POINT(longitude latitude).
      location: `POINT(${input.point.lng} ${input.point.lat})`,
      report_type: input.reportType,
      severity: input.severity,
      time_of_day: timeOfDay,
      description,
    })
    .select("id, created_at, upvotes")
    .single();

  if (error) throw error;

  return {
    id: String(data.id),
    source: "safety_reports",
    reportType: input.reportType,
    locationAddress: input.address,
    severity: input.severity,
    description,
    createdAt: data.created_at ?? new Date().toISOString(),
    upvotes: data.upvotes ?? 0,
    userId: user.id,
    coordinates: { lat: input.point.lat, lng: input.point.lng },
    municipality: null,
    timeOfDay,
    basis: "incident",
  };
}

export interface ToggleLikeResult {
  liked: boolean;
  upvotes: number;
}

/**
 * Add or remove the current user's like, then store the recounted total.
 *
 * The total is recounted from `report_likes` rather than incrementing the
 * previous value, so two people liking at the same time cannot overwrite
 * each other's count.
 */
export async function toggleReportLike(reportId: string): Promise<ToggleLikeResult> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("not-authenticated");

  const likes = supabase.from("report_likes");

  const { data: existing, error: lookupError } = await likes
    .select("id")
    .eq("user_id", user.id)
    .eq("report_id", reportId)
    .eq("report_source", LIKE_SOURCE)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await likes.delete().eq("id", (existing as { id: string }).id);
    if (error) throw error;
  } else {
    const { error } = await likes.insert({
      user_id: user.id,
      report_id: reportId,
      report_source: LIKE_SOURCE,
    });
    if (error) throw error;
  }

  const upvotes = await recountLikes(reportId);
  return { liked: !existing, upvotes };
}

async function recountLikes(reportId: string): Promise<number> {
  const { count, error } = await supabase
    .from("report_likes")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId)
    .eq("report_source", LIKE_SOURCE);

  if (error) throw error;

  const total = count ?? 0;

  // Mirror the total onto the report so it can be read without a join.
  const { error: updateError } = await supabase
    .from("safety_reports")
    .update({ upvotes: total })
    .eq("id", reportId);

  if (updateError) throw updateError;

  return total;
}

/**
 * Delete one of the current user's own reports.
 *
 * Row-level security enforces ownership server-side; the explicit check here
 * turns a silent no-op into a clear message.
 */
export async function deleteSafetyReport(reportId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("not-authenticated");

  const { data: row, error: lookupError } = await supabase
    .from("safety_reports")
    .select("user_id")
    .eq("id", reportId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!row || row.user_id !== user.id) throw new Error("not-owner");

  // Likes reference the report by id, not by foreign key, so clear them first.
  const { error: likesError } = await supabase
    .from("report_likes")
    .delete()
    .eq("report_id", reportId)
    .eq("report_source", LIKE_SOURCE);

  if (likesError) throw likesError;

  const { error } = await supabase.from("safety_reports").delete().eq("id", reportId);
  if (error) throw error;
}
