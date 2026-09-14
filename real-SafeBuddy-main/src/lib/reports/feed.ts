import { distanceKm, type LatLng } from "@/lib/geo";
import { getReportTypeKey, getReportTypeMeta } from "./reportTypes";
import type { SafetyReport } from "./types";

/**
 * Searching, type filtering, distance and sorting for the community feed.
 *
 * Pure functions over the reports that are already loaded, so the feed needs
 * no extra queries. Time and severity filtering stay in `filters.ts`.
 */

export type FeedSort = "newest" | "nearest" | "votes";

export const FEED_SORT_OPTIONS: { value: FeedSort; label: string }[] = [
  { value: "newest", label: "Nieuwste" },
  { value: "nearest", label: "Dichtstbij" },
  { value: "votes", label: "Meest gestemd" },
];

export interface FeedQuery {
  search: string;
  /** Selected type keys; empty means every type. */
  types: ReadonlySet<string>;
  sort: FeedSort;
  /** The user's position, when known. */
  origin: LatLng | null;
  /** Only keep reports within this distance. `null` means no limit. */
  radiusKm: number | null;
}

export interface FeedItem {
  report: SafetyReport;
  /** Distance from `origin`, or null without a position or coordinates. */
  distanceKm: number | null;
}

/** Combining accent marks left behind by NFD normalisation. */
const ACCENTS = /[\u0300-\u036f]/g;

/** Lower case without accents, so "cafe" also finds "café". */
const fold = (text: string) => text.normalize("NFD").replace(ACCENTS, "").toLowerCase();

export function buildFeed(
  reports: readonly SafetyReport[],
  { search, types, sort, origin, radiusKm }: FeedQuery
): FeedItem[] {
  const terms = fold(search).split(/\s+/).filter(Boolean);
  const items: FeedItem[] = [];

  for (const report of reports) {
    if (types.size > 0 && !types.has(getReportTypeKey(report))) continue;

    if (terms.length > 0) {
      const haystack = fold(
        `${report.locationAddress} ${report.description} ${getReportTypeMeta(report).label} ${report.reportType}`
      );
      if (!terms.every((term) => haystack.includes(term))) continue;
    }

    const distance =
      origin && report.coordinates
        ? distanceKm(origin.lat, origin.lng, report.coordinates.lat, report.coordinates.lng)
        : null;
    if (radiusKm !== null && (distance === null || distance > radiusKm)) continue;

    items.push({ report, distanceKm: distance });
  }

  // The loader already delivers newest first, and Array.sort is stable, so
  // equal values keep that order.
  if (sort === "nearest") {
    items.sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  } else if (sort === "votes") {
    items.sort((a, b) => b.report.upvotes - a.report.upvotes);
  }

  return items;
}

/** "320 m" or "1,2 km", in Dutch notation. */
export function formatDistanceNl(km: number): string {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toLocaleString("nl-NL", {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: km < 10 ? 1 : 0,
  })} km`;
}
