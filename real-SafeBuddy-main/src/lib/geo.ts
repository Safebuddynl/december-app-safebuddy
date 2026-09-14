/**
 * Coordinate helpers. Everything geographic that is not tied to Leaflet,
 * Supabase or React lives here so it can be reasoned about (and tested)
 * on its own.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NamedLocation extends LatLng {
  name: string;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two points, in kilometres. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** "1.2 km" or "480 m", for display. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** "12 min" or "1 u 05 min", for display. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} u ${String(minutes).padStart(2, "0")} min`;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Parse a coordinate that may use a comma as its decimal separator.
 *
 * The imported KRO dataset stores latitude/longitude as text in Dutch
 * notation ("52,388404"). Passing that straight to `parseFloat` silently
 * yields `52`, which put every historic report on the wrong spot on the map.
 */
export function parseCoordinate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalised = value.trim().replace(",", ".");
  if (normalised === "") return null;

  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Decode a PostGIS point from its hex EWKB representation.
 *
 * PostgREST returns a `geography(Point)` column as a hex string such as
 * `0101000020E6100000...`. Decoding it in the browser avoids needing a
 * database function just to read back a latitude and longitude.
 *
 * Returns `null` for anything that is not a well-formed 2D point.
 */
export function decodeWkbPoint(hex: unknown): LatLng | null {
  if (typeof hex !== "string" || hex.length < 42 || !/^[0-9a-fA-F]+$/.test(hex)) return null;

  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number.parseInt(hex.substr(i * 2, 2), 16);
    }

    const view = new DataView(bytes.buffer);
    const littleEndian = bytes[0] === 1;
    const rawType = view.getUint32(1, littleEndian);

    // Bit 0x20000000 marks an EWKB geometry carrying an SRID, which occupies
    // four extra bytes before the coordinates.
    const hasSrid = (rawType & 0x20000000) !== 0;
    const geometryType = rawType & 0xff;
    if (geometryType !== 1) return null; // 1 === Point

    const offset = hasSrid ? 9 : 5;
    if (bytes.byteLength < offset + 16) return null;

    // PostGIS stores points as (X, Y) which is (longitude, latitude).
    const lng = view.getFloat64(offset, littleEndian);
    const lat = view.getFloat64(offset + 8, littleEndian);

    return isValidLatLng(lat, lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/**
 * A uniform grid that buckets points by coordinate so nearby-point lookups
 * do not have to scan the whole dataset.
 *
 * Scoring a route used to compare every route vertex against every one of the
 * ~15.000 reports, which is tens of millions of distance calculations per
 * search. With the grid only the handful of cells around each vertex is
 * examined.
 */
export class SpatialGrid<T extends LatLng> {
  private readonly cells = new Map<string, T[]>();

  /** @param cellSizeDegrees roughly 0.01 deg ≈ 1.1 km of latitude. */
  constructor(items: readonly T[], private readonly cellSizeDegrees = 0.01) {
    for (const item of items) {
      const key = this.keyFor(item.lat, item.lng);
      const bucket = this.cells.get(key);
      if (bucket) bucket.push(item);
      else this.cells.set(key, [item]);
    }
  }

  private keyFor(lat: number, lng: number): string {
    return `${Math.floor(lat / this.cellSizeDegrees)}:${Math.floor(lng / this.cellSizeDegrees)}`;
  }

  /**
   * Every item in the cells covering a square of `radiusKm` around the point.
   * This is a cheap over-approximation: callers still filter on real distance.
   */
  near(lat: number, lng: number, radiusKm: number): T[] {
    const latDegrees = radiusKm / 111;
    const cellsToScan = Math.max(1, Math.ceil(latDegrees / this.cellSizeDegrees));
    const centreLat = Math.floor(lat / this.cellSizeDegrees);
    const centreLng = Math.floor(lng / this.cellSizeDegrees);

    const found: T[] = [];
    for (let dLat = -cellsToScan; dLat <= cellsToScan; dLat++) {
      for (let dLng = -cellsToScan; dLng <= cellsToScan; dLng++) {
        const bucket = this.cells.get(`${centreLat + dLat}:${centreLng + dLng}`);
        if (bucket) found.push(...bucket);
      }
    }
    return found;
  }
}
