import { MAPBOX_TOKEN } from "@/lib/env";
import { formatDistance, formatDuration, type LatLng } from "@/lib/geo";
import type { MappedReport } from "@/lib/reports/types";
import type { LightingResult } from "@/lib/safety/lighting";
import { computeAvoidanceWaypoint } from "./avoidance";
import { buildReportIndex, scoreRoute, type RouteSafety } from "./safety";

/** How the user is travelling. Maps onto a Mapbox routing profile. */
export type TravelMode = "foot" | "bike" | "car";

const MAPBOX_PROFILE: Record<TravelMode, string> = {
  foot: "mapbox/walking",
  bike: "mapbox/cycling",
  car: "mapbox/driving",
};

/**
 * A safer alternative is only worth offering if it does not cost too much
 * extra time. Anything slower than the quickest route by more than this is
 * discarded.
 */
const MAX_EXTRA_SECONDS = 900; // 15 minutes

export interface RouteStep {
  instruction: string;
  /** Metres. */
  distance: number;
  /** Seconds. */
  duration: number;
  /** Step geometry as [lat, lng] pairs. */
  coordinates: [number, number][];
}

export interface PlannedRoute {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  distanceLabel: string;
  durationLabel: string;
  safety: RouteSafety;
  steps: RouteStep[];
}

export interface RouteOptions {
  /** The quickest route Mapbox offered. */
  fastest: PlannedRoute;
  /** The safest route that is not unreasonably slower than `fastest`. */
  safest: PlannedRoute;
}

export class RoutingError extends Error {}

/**
 * Ask Mapbox for routes between two points and score each one.
 *
 * Mapbox is asked for alternatives, which is what makes a "safest" choice
 * possible at all: the safety score only picks between routes it returns.
 */
export async function planRoutes(
  from: LatLng,
  to: LatLng,
  travelMode: TravelMode,
  reports: readonly MappedReport[]
): Promise<RouteOptions> {
  if (!MAPBOX_TOKEN) throw new RoutingError("Mapbox-token ontbreekt");

  // The direct request, which is the only one that may return alternatives.
  const candidates = await requestRoutes([from, to], travelMode, { alternatives: true });

  if (candidates.length === 0) {
    throw new RoutingError("Geen route gevonden tussen deze punten");
  }

  // On short trips Mapbox often returns a single route, so ask separately for
  // one that goes around any recent hazard on the direct line. Failing to
  // find a detour is not an error: the direct routes still stand.
  const detour = computeAvoidanceWaypoint(from, to, reports);
  if (detour) {
    try {
      candidates.push(
        ...(await requestRoutes([from, detour, to], travelMode, { alternatives: false }))
      );
    } catch (error) {
      console.warn("[SafeBuddy] Could not plan a detour around a hazard:", error);
    }
  }

  // Index the reports once, then reuse it for every candidate route.
  const index = buildReportIndex(reports);
  const planned = candidates.map((route) => toPlannedRoute(route, index, null));

  const fastest = planned.reduce((best, route) =>
    route.durationSeconds < best.durationSeconds ? route : best
  );

  const viable = planned.filter(
    (route) => route.durationSeconds - fastest.durationSeconds <= MAX_EXTRA_SECONDS
  );

  const safest = viable.reduce(
    (best, route) => (route.safety.score > best.safety.score ? route : best),
    fastest
  );

  return { fastest, safest };
}

/** One call to the Mapbox Directions API. */
async function requestRoutes(
  waypoints: readonly LatLng[],
  travelMode: TravelMode,
  { alternatives }: { alternatives: boolean }
): Promise<MapboxRoute[]> {
  const coordinates = waypoints.map((point) => `${point.lng},${point.lat}`).join(";");
  const url = new URL(
    `https://api.mapbox.com/directions/v5/${MAPBOX_PROFILE[travelMode]}/${coordinates}`
  );
  url.searchParams.set("alternatives", String(alternatives));
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "true");
  url.searchParams.set("language", "nl");
  url.searchParams.set("access_token", MAPBOX_TOKEN);

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new RoutingError(data?.message ?? `Mapbox gaf status ${response.status}`);
  }

  return Array.isArray(data.routes) ? data.routes : [];
}

interface MapboxRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs?: { steps?: MapboxStep[] }[];
}

interface MapboxStep {
  distance: number;
  duration: number;
  maneuver?: { instruction?: string };
  geometry?: { coordinates: [number, number][] };
}

function toPlannedRoute(
  route: MapboxRoute,
  index: ReturnType<typeof buildReportIndex>,
  lighting: LightingResult | null
): PlannedRoute {
  // Mapbox returns GeoJSON [lng, lat]; Leaflet and the rest of the app use
  // [lat, lng], so flip once here rather than at every use site.
  const coordinates = route.geometry.coordinates.map(
    ([lng, lat]) => [lat, lng] as [number, number]
  );

  return {
    coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    distanceLabel: formatDistance(route.distance),
    durationLabel: formatDuration(route.duration),
    safety: scoreRoute(coordinates, index, {
      lighting,
      distanceKm: route.distance / 1000,
    }),
    steps: extractSteps(route),
  };
}

/**
 * Re-score an already planned route with lighting data that arrived late.
 *
 * Route planning does not wait for OpenStreetMap, so this lets the interface
 * refine the score once the lighting request finishes.
 */
export function rescoreWithLighting(
  route: PlannedRoute,
  reports: readonly MappedReport[],
  lighting: LightingResult | null
): PlannedRoute {
  const index = buildReportIndex(reports);
  return {
    ...route,
    safety: scoreRoute(route.coordinates, index, {
      lighting,
      distanceKm: route.distanceMeters / 1000,
    }),
  };
}

function extractSteps(route: MapboxRoute): RouteStep[] {
  const steps: RouteStep[] = [];

  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      steps.push({
        instruction: step.maneuver?.instruction || "Volg de route",
        distance: step.distance,
        duration: step.duration,
        coordinates: (step.geometry?.coordinates ?? []).map(
          ([lng, lat]) => [lat, lng] as [number, number]
        ),
      });
    }
  }

  return steps;
}
