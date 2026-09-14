import type { SafetyReport, Severity } from "./types";

/**
 * The filters shared by the map and the community feed.
 *
 * Both screens offer the same time and severity choices, so the windows and
 * the filtering itself are defined once here.
 */

export type TimeFilter = "live" | "1h" | "24h" | "week" | "all";
export type SeverityFilter = Severity | "all";

/** How far back each option looks, in milliseconds. `all` has no limit. */
const TIME_WINDOW_MS: Record<Exclude<TimeFilter, "all">, number> = {
  live: 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/** Option list for rendering the filter buttons. */
export const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "1h", label: "1u" },
  { value: "24h", label: "24u" },
  { value: "week", label: "Week" },
  { value: "all", label: "Alles" },
];

export interface ReportFilters {
  time: TimeFilter;
  severity: SeverityFilter;
}

export const DEFAULT_FILTERS: ReportFilters = { time: "all", severity: "all" };

/** Apply both filters. Returns the same array when nothing is filtered out. */
export function applyFilters<T extends { report: SafetyReport } | SafetyReport>(
  items: readonly T[],
  filters: ReportFilters,
  now = Date.now()
): T[] {
  const window = filters.time === "all" ? null : TIME_WINDOW_MS[filters.time];

  return items.filter((item) => {
    const report = "report" in item ? item.report : (item as SafetyReport);

    if (filters.severity !== "all" && report.severity !== filters.severity) return false;

    if (window !== null) {
      const createdAt = new Date(report.createdAt).getTime();
      if (!Number.isFinite(createdAt) || now - createdAt > window) return false;
    }

    return true;
  });
}
