import { distanceKm, type LatLng } from "@/lib/geo";
import type { RouteStep } from "@/lib/routing/directions";

/**
 * Geometry for the navigation screen: which way a turn goes, where the user
 * is along the route, and which way the route heads from there.
 *
 * Everything is derived from coordinates the route already has, so the
 * routing layer does not need to know about any of this.
 */

export type Turn =
  | "depart"
  | "straight"
  | "slight-left"
  | "left"
  | "sharp-left"
  | "slight-right"
  | "right"
  | "sharp-right"
  | "uturn"
  | "arrive";

type Point = readonly [number, number];

/** Points closer than this are treated as the same spot. */
const SAME_POINT_METERS = 3;
/** How far ahead the camera looks to decide its direction. */
const LOOK_AHEAD_METERS = 25;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const metersBetween = (a: Point, b: Point) => distanceKm(a[0], a[1], b[0], b[1]) * 1000;

/** Compass bearing from `a` to `b`, in degrees 0–360. Points are [lat, lng]. */
export function bearingBetween(a: Point, b: Point): number {
  const [lat1, lng1] = a.map(toRadians);
  const [lat2, lng2] = b.map(toRadians);
  const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function outgoingBearing(coordinates: readonly Point[]): number | null {
  const start = coordinates[0];
  if (!start) return null;
  for (let i = 1; i < coordinates.length; i++) {
    if (metersBetween(start, coordinates[i]) > SAME_POINT_METERS) {
      return bearingBetween(start, coordinates[i]);
    }
  }
  return null;
}

function incomingBearing(coordinates: readonly Point[]): number | null {
  const end = coordinates[coordinates.length - 1];
  if (!end) return null;
  for (let i = coordinates.length - 2; i >= 0; i--) {
    if (metersBetween(coordinates[i], end) > SAME_POINT_METERS) {
      return bearingBetween(coordinates[i], end);
    }
  }
  return null;
}

/**
 * The manoeuvre at the start of `steps[index]`, from the angle between the
 * way the previous step arrives and the way this one leaves.
 */
export function turnForStep(steps: readonly RouteStep[], index: number): Turn {
  const step = steps[index];
  if (!step) return "arrive";
  if (index === 0) return "depart";

  const isLast = index === steps.length - 1;
  const incoming = incomingBearing(steps[index - 1].coordinates);
  const outgoing = outgoingBearing(step.coordinates);
  if (incoming === null || outgoing === null) return isLast ? "arrive" : "straight";

  // -180..180, positive is a turn to the right.
  const delta = ((outgoing - incoming + 540) % 360) - 180;
  const angle = Math.abs(delta);
  const side = delta > 0 ? "right" : "left";

  if (angle < 20) return "straight";
  if (angle < 55) return `slight-${side}`;
  if (angle < 120) return side;
  if (angle < 160) return `sharp-${side}`;
  return "uturn";
}

export interface RouteMeasure {
  coordinates: readonly Point[];
  /** Metres from the start to each coordinate. */
  cumulative: number[];
  total: number;
}

export function measureRoute(coordinates: readonly Point[]): RouteMeasure {
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1] + metersBetween(coordinates[i - 1], coordinates[i]));
  }
  return { coordinates, cumulative, total: cumulative[cumulative.length - 1] ?? 0 };
}

export interface RouteLocation {
  /** Index of the segment the user is on. Pass back as the next `hint`. */
  index: number;
  traveledMeters: number;
  /** Distance from the user to the route line. */
  offRouteMeters: number;
  /** Direction the route heads a little ahead of the user. */
  bearingAhead: number | null;
}

/** Project a position onto a segment, using a local flat approximation. */
function projectOnSegment(position: LatLng, a: Point, b: Point) {
  const kx = 111_320 * Math.cos(toRadians(position.lat));
  const ky = 110_540;
  const ax = (a[1] - position.lng) * kx;
  const ay = (a[0] - position.lat) * ky;
  const dx = (b[1] - position.lng) * kx - ax;
  const dy = (b[0] - position.lat) * ky - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? clamp(-(ax * dx + ay * dy) / lengthSquared, 0, 1) : 0;
  return { t, distance: Math.hypot(ax + t * dx, ay + t * dy) };
}

/**
 * Where the user is along the route. Searches near the previous segment first
 * (`hint`), and only scans the whole line when that finds nothing close.
 */
export function locateOnRoute(measure: RouteMeasure, position: LatLng, hint = 0): RouteLocation {
  const { coordinates, cumulative } = measure;
  const last = coordinates.length - 1;

  const search = (from: number, to: number) => {
    let best = { index: from, t: 0, distance: Number.POSITIVE_INFINITY };
    for (let i = from; i < to; i++) {
      const { t, distance } = projectOnSegment(position, coordinates[i], coordinates[i + 1]);
      if (distance < best.distance) best = { index: i, t, distance };
    }
    return best;
  };

  let best = search(clamp(hint - 3, 0, last - 1), clamp(hint + 60, 1, last));
  if (best.distance > 50) {
    const full = search(0, last);
    if (full.distance < best.distance) best = full;
  }

  const segmentLength = cumulative[best.index + 1] - cumulative[best.index];
  const traveledMeters = cumulative[best.index] + segmentLength * best.t;

  const a = coordinates[best.index];
  const b = coordinates[best.index + 1];
  const here: Point = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];

  let ahead = best.index + 1;
  while (ahead < last && cumulative[ahead] - traveledMeters < LOOK_AHEAD_METERS) ahead++;

  return {
    index: best.index,
    traveledMeters,
    offRouteMeters: best.distance,
    bearingAhead:
      metersBetween(here, coordinates[ahead]) > 1 ? bearingBetween(here, coordinates[ahead]) : null,
  };
}
