import { useEffect, useMemo, useRef } from "react";
import type { LatLng } from "@/lib/geo";
import { bearingBetween, locateOnRoute, measureRoute } from "@/lib/navigation/maneuvers";
import type { PlannedRoute } from "@/lib/routing/directions";

/**
 * What the navigation screen shows, derived from the route and the GPS fix:
 * where the camera points, how much of the line is behind the user, and how
 * long is left.
 */

/** Further than this from the route, the device heading beats the route direction. */
const OFF_ROUTE_METERS = 40;

export interface NavigationView {
  /** The user's position, or the route start before the first GPS fix. */
  cameraTarget: LatLng;
  bearing: number;
  /** Share of the route already travelled, 0–1. */
  progress: number;
  remainingMeters: number;
  remainingSeconds: number;
  arrival: Date;
}

export function useNavigationView(
  route: PlannedRoute | null,
  position: LatLng | null,
  heading: number,
  isNavigating: boolean
): NavigationView | null {
  const coordinates = route?.coordinates;
  const measure = useMemo(() => (coordinates ? measureRoute(coordinates) : null), [coordinates]);

  // The segment found last time, so each fix only searches nearby.
  const hintRef = useRef(0);
  useEffect(() => {
    hintRef.current = 0;
  }, [measure]);

  return useMemo(() => {
    if (!isNavigating || !route || !measure || measure.coordinates.length < 2) return null;

    const [start, second] = measure.coordinates;
    const location = position ? locateOnRoute(measure, position, hintRef.current) : null;
    if (location) hintRef.current = location.index;

    let bearing = location?.bearingAhead ?? bearingBetween(start, second);
    if (location && location.offRouteMeters > OFF_ROUTE_METERS && heading) bearing = heading;

    const traveled = location?.traveledMeters ?? 0;
    const remainingMeters = Math.max(0, measure.total - traveled);
    const secondsPerMeter =
      route.distanceMeters > 0 ? route.durationSeconds / route.distanceMeters : 0;
    const remainingSeconds = remainingMeters * secondsPerMeter;

    return {
      cameraTarget: position ?? { lat: start[0], lng: start[1] },
      bearing,
      progress: measure.total > 0 ? Math.min(1, traveled / measure.total) : 0,
      remainingMeters,
      remainingSeconds,
      arrival: new Date(Date.now() + remainingSeconds * 1000),
    };
  }, [isNavigating, route, measure, position, heading]);
}
