import { distanceKm, type LatLng } from "@/lib/geo";
import type { MappedReport } from "./types";

export interface NearbyReport {
  item: MappedReport;
  distanceKm: number;
}

/**
 * The reports closest to a point, nearest first.
 *
 * A cheap bounding-box check skips almost all of the ~15.000 reports before
 * the exact distance is computed, so this can run on every map move.
 */
export function nearestReports(
  reports: readonly MappedReport[],
  center: LatLng,
  radiusKm: number,
  limit: number
): NearbyReport[] {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));

  const found: NearbyReport[] = [];
  for (const item of reports) {
    if (Math.abs(item.lat - center.lat) > latDelta) continue;
    if (Math.abs(item.lng - center.lng) > lngDelta) continue;

    const distance = distanceKm(center.lat, center.lng, item.lat, item.lng);
    if (distance <= radiusKm) found.push({ item, distanceKm: distance });
  }

  return found.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}
