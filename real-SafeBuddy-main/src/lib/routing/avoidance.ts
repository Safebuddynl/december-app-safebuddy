import { distanceKm, type LatLng } from "@/lib/geo";
import { ageInDays, type MappedReport } from "@/lib/reports/types";

/**
 * Steering short trips away from recent, serious reports.
 *
 * Asking Mapbox for alternatives only helps when it offers one. On a short
 * walk it often returns a single straight route, so the safest option is the
 * only option. To get a real choice we insert a waypoint beside the problem
 * spot, which forces Mapbox to route around it.
 */

/** Only applied below this trip length; longer trips get enough alternatives. */
const MAX_TRIP_KM = 3;

/** How recent a report must be to be worth a detour. */
const MAX_REPORT_AGE_DAYS = 30;

/** A report counts as "on the way" if it barely lengthens the trip. */
const ON_ROUTE_TOLERANCE_KM = 0.1;

/** How far to the side the waypoint is placed, in degrees (~400 m). */
const DETOUR_OFFSET_DEGREES = 0.0036;

/**
 * A point to route via so the trip avoids a nearby hazard, or `null` when no
 * detour is warranted.
 */
export function computeAvoidanceWaypoint(
  from: LatLng,
  to: LatLng,
  reports: readonly MappedReport[],
  now = Date.now()
): LatLng | null {
  const tripKm = distanceKm(from.lat, from.lng, to.lat, to.lng);
  if (tripKm === 0 || tripKm > MAX_TRIP_KM) return null;

  const blocker = findBlockingReport(from, to, tripKm, reports, now);
  if (!blocker) return null;

  // Unit vector from start to destination, in degrees.
  const dLat = to.lat - from.lat;
  const dLng = to.lng - from.lng;
  const length = Math.hypot(dLat, dLng);
  if (length === 0) return null;

  // Perpendicular to the direct line, so the waypoint sits beside it.
  const perpLat = -dLng / length;
  const perpLng = dLat / length;

  // Project the hazard onto the line to decide where along it to detour.
  const progress = clamp(distanceKm(from.lat, from.lng, blocker.lat, blocker.lng) / tripKm, 0, 1);
  const onLine: LatLng = {
    lat: from.lat + dLat * progress,
    lng: from.lng + dLng * progress,
  };

  const left: LatLng = {
    lat: onLine.lat + perpLat * DETOUR_OFFSET_DEGREES,
    lng: onLine.lng + perpLng * DETOUR_OFFSET_DEGREES,
  };
  const right: LatLng = {
    lat: onLine.lat - perpLat * DETOUR_OFFSET_DEGREES,
    lng: onLine.lng - perpLng * DETOUR_OFFSET_DEGREES,
  };

  // Take whichever side ends up further from the hazard.
  const leftDistance = distanceKm(left.lat, left.lng, blocker.lat, blocker.lng);
  const rightDistance = distanceKm(right.lat, right.lng, blocker.lat, blocker.lng);

  return leftDistance > rightDistance ? left : right;
}

/**
 * The first recent high-severity report that sits on the direct line.
 *
 * "On the line" is measured by detour cost: if going via the report barely
 * lengthens the trip, it is effectively on the way.
 */
function findBlockingReport(
  from: LatLng,
  to: LatLng,
  tripKm: number,
  reports: readonly MappedReport[],
  now: number
): MappedReport | null {
  for (const candidate of reports) {
    if (candidate.report.severity !== "high") continue;
    if (ageInDays(candidate.report.createdAt, now) >= MAX_REPORT_AGE_DAYS) continue;

    const viaLength =
      distanceKm(from.lat, from.lng, candidate.lat, candidate.lng) +
      distanceKm(candidate.lat, candidate.lng, to.lat, to.lng);

    if (Math.abs(viaLength - tripKm) < ON_ROUTE_TOLERANCE_KM) return candidate;
  }

  return null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
