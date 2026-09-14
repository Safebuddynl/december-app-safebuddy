import { SpatialGrid, distanceKm, type LatLng } from "@/lib/geo";

/**
 * Street lighting along a route, from OpenStreetMap.
 *
 * This is the answer to the cold-start problem: a street with no reports is
 * not necessarily safe, it may simply be a street nobody has walked yet.
 * Lighting is an objective property of the place that exists whether or not
 * anyone has filed a report.
 *
 * It is deliberately **best-effort and never blocking**. Overpass is a free,
 * heavily shared service: measured from this project it took 54 seconds for a
 * single neighbourhood, and the main endpoint rate-limits anonymous clients.
 * So the route is planned and shown first, and lighting refines the score
 * afterwards if it arrives in time.
 */

/** Public Overpass endpoints, tried in order. */
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

/** Give up after this long. Route planning must not wait on Overpass. */
const TIMEOUT_MS = 12_000;

/** A route point counts as lit if a lamp is within this distance. */
const LAMP_REACH_KM = 0.05;

/** Refuse to query enormous areas: Overpass will time out and it is rude. */
const MAX_BBOX_DEGREES = 0.5;

export interface LightingResult {
  /** Fraction of sampled route points with a street lamp nearby, 0 to 1. */
  coverage: number;
  /** How many lamps were found in the route corridor. */
  lampCount: number;
  /** How many route points were sampled. */
  sampled: number;
}

/**
 * In-memory cache keyed by rounded bounding box, so switching travel mode or
 * replanning the same trip does not hit Overpass again.
 */
const cache = new Map<string, LightingResult | null>();

/**
 * Measure how much of a route is lit.
 *
 * Returns `null` when the data could not be fetched, which callers must treat
 * as "unknown", never as "unlit".
 */
export async function fetchLightingCoverage(
  coordinates: readonly [number, number][],
  signal?: AbortSignal
): Promise<LightingResult | null> {
  if (coordinates.length === 0) return null;

  const box = boundingBox(coordinates);
  if (box.maxLat - box.minLat > MAX_BBOX_DEGREES || box.maxLng - box.minLng > MAX_BBOX_DEGREES) {
    return null;
  }

  const key = cacheKey(box);
  if (cache.has(key)) return cache.get(key) ?? null;

  const lamps = await fetchLamps(box, signal);
  if (!lamps) {
    cache.set(key, null);
    return null;
  }

  const result = measureCoverage(coordinates, lamps);
  cache.set(key, result);
  return result;
}

interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

function boundingBox(coordinates: readonly [number, number][]): BoundingBox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of coordinates) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  // A small margin so lamps just off the line still count.
  const pad = 0.002;
  return {
    minLat: minLat - pad,
    minLng: minLng - pad,
    maxLat: maxLat + pad,
    maxLng: maxLng + pad,
  };
}

const cacheKey = (b: BoundingBox) =>
  [b.minLat, b.minLng, b.maxLat, b.maxLng].map((n) => n.toFixed(3)).join(",");

async function fetchLamps(box: BoundingBox, signal?: AbortSignal): Promise<LatLng[] | null> {
  const query =
    `[out:json][timeout:20];` +
    `node["highway"="street_lamp"](${box.minLat},${box.minLng},${box.maxLat},${box.maxLng});` +
    `out skel;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
    // Abort if either the caller cancels or the timeout fires.
    const onCallerAbort = () => timeout.abort();
    signal?.addEventListener("abort", onCallerAbort);

    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        signal: timeout.signal,
      });
      if (!response.ok) continue;

      const data = await response.json();
      const elements: { lat?: number; lon?: number }[] = data?.elements ?? [];

      return elements
        .filter((e) => typeof e.lat === "number" && typeof e.lon === "number")
        .map((e) => ({ lat: e.lat as number, lng: e.lon as number }));
    } catch {
      // Timed out, rate-limited or offline: try the next mirror, then give up.
      continue;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  return null;
}

/**
 * What share of the route has a lamp within {@link LAMP_REACH_KM}.
 *
 * The route is sampled rather than measured at every vertex: Mapbox returns
 * hundreds of points for a short walk, and evenly spaced samples give the same
 * answer for a fraction of the work.
 */
function measureCoverage(
  coordinates: readonly [number, number][],
  lamps: readonly LatLng[]
): LightingResult {
  if (lamps.length === 0) {
    return { coverage: 0, lampCount: 0, sampled: 0 };
  }

  const index = new SpatialGrid(lamps as LatLng[], 0.002);
  const step = Math.max(1, Math.floor(coordinates.length / 120));

  let sampled = 0;
  let lit = 0;

  for (let i = 0; i < coordinates.length; i += step) {
    const [lat, lng] = coordinates[i];
    sampled++;

    const nearby = index.near(lat, lng, LAMP_REACH_KM);
    if (nearby.some((lamp) => distanceKm(lat, lng, lamp.lat, lamp.lng) <= LAMP_REACH_KM)) {
      lit++;
    }
  }

  return {
    coverage: sampled === 0 ? 0 : lit / sampled,
    lampCount: lamps.length,
    sampled,
  };
}
