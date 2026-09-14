import type { LatLng } from "@/lib/geo";

export type Severity = "low" | "medium" | "high";

/**
 * Where a report came from. Both sources are shown side by side in the app,
 * but only `safety_reports` rows can be edited by users.
 *
 * `kro` is the imported historic dataset (Kaart Route Onveiligheid). Its table
 * is read-only: it has no `upvotes` column and no row-level ownership.
 */
export type ReportSource = "safety_reports" | "kro";

/** The exact table name in Supabase. Verified against the live schema. */
export const KRO_TABLE = "KRO_Reports_15K";

/**
 * Why somewhere was reported.
 *
 * The imported dataset asks people to pick a reason, and the answers differ
 * enormously in evidential weight: "something happened to me here" is a
 * recorded incident, while "I find this area unsettling" is a perception.
 * Both are worth knowing; they should not count the same.
 */
export type ReportBasis = "incident" | "behaviour" | "perception" | "unknown";

export interface SafetyReport {
  id: string;
  source: ReportSource;
  reportType: string;
  locationAddress: string;
  severity: Severity;
  description: string;
  createdAt: string;
  upvotes: number;
  /** Only present on `safety_reports` rows; used for the delete permission. */
  userId: string | null;
  /** `null` when the row had no usable coordinates. */
  coordinates: LatLng | null;
  /** Municipality name, used to correct for population density. */
  municipality: string | null;
  /** Raw "when is this a problem" answer, if the source records one. */
  timeOfDay: string | null;
  /** What kind of evidence the report represents. */
  basis: ReportBasis;
}

/**
 * Classify the free-text reason from the imported dataset.
 *
 * Answers are combined with "en", so a single row can mention several
 * reasons. The strongest one present wins.
 */
export function classifyBasis(reason: unknown): ReportBasis {
  const text = String(reason ?? "").toLowerCase();
  if (!text) return "unknown";

  if (text.includes("iets is overkomen")) return "incident";
  if (text.includes("gedrag van andere")) return "behaviour";
  if (text.includes("omgeving hier onveilig")) return "perception";
  return "unknown";
}

/**
 * How much weight each kind of report carries.
 *
 * An actual incident counts roughly three times a general unease about a
 * place. Perception still counts: a street everyone avoids after dark is a
 * real fact about that street.
 */
export const BASIS_WEIGHT: Record<ReportBasis, number> = {
  incident: 1.5,
  behaviour: 1.0,
  perception: 0.55,
  unknown: 0.8,
};

/** A report that is known to have coordinates, ready to plot. */
export interface MappedReport extends LatLng {
  report: SafetyReport;
}

export interface SeverityCounts {
  high: number;
  medium: number;
  low: number;
}

/**
 * Normalise the many severity spellings that reach the app.
 *
 * `safety_reports` stores lowercase values, the imported KRO data uses
 * capitalised Dutch/English words ("High", "Medium"), and older rows use
 * "critical". Comparing raw strings meant every KRO report was treated as
 * low risk regardless of its real severity.
 */
export function normaliseSeverity(value: unknown): Severity {
  const text = String(value ?? "").trim().toLowerCase();

  if (text === "high" || text === "critical" || text === "hoog" || text === "kritiek") return "high";
  if (text === "low" || text === "laag") return "low";
  return "medium";
}

export function countBySeverity(reports: readonly { report: SafetyReport }[]): SeverityCounts {
  const counts: SeverityCounts = { high: 0, medium: 0, low: 0 };
  for (const { report } of reports) counts[report.severity]++;
  return counts;
}

/** Age of a report in days, used to weigh old reports down. */
export function ageInDays(createdAt: string, now = Date.now()): number {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return (now - timestamp) / (1000 * 60 * 60 * 24);
}

/** "5m geleden" / "3u geleden" / "12d geleden". */
export function formatRelativeTime(createdAt: string, now = Date.now()): string {
  const diffMs = now - new Date(createdAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m geleden`;

  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours}u geleden`;

  return `${Math.floor(diffMs / 86_400_000)}d geleden`;
}
