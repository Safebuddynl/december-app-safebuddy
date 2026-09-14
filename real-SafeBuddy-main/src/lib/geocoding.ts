import { MAPBOX_TOKEN } from "@/lib/env";
import type { LatLng, NamedLocation } from "@/lib/geo";

/**
 * Turning text into coordinates and back.
 *
 * Mapbox is the primary provider; Nominatim is a keyless fallback so the app
 * still works when no Mapbox token is configured.
 */

export interface PlaceSuggestion {
  /** Human-readable label shown in the dropdown. */
  label: string;
  lat: number;
  lng: number;
}

export interface SearchOptions {
  /** Bias results towards this point, usually the current map centre. */
  near?: LatLng;
  limit?: number;
  signal?: AbortSignal;
}

/** Address suggestions for a search box. Returns `[]` rather than throwing. */
export async function searchPlaces(
  query: string,
  { near, limit = 5, signal }: SearchOptions = {}
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (MAPBOX_TOKEN) {
    try {
      return await searchWithMapbox(trimmed, { near, limit, signal });
    } catch (error) {
      if (isAbort(error)) return [];
      console.warn("[SafeBuddy] Mapbox search failed, falling back to Nominatim:", error);
    }
  }

  try {
    return await searchWithNominatim(trimmed, { limit, signal });
  } catch (error) {
    if (!isAbort(error)) console.error("[SafeBuddy] Address search failed:", error);
    return [];
  }
}

async function searchWithMapbox(
  query: string,
  { near, limit, signal }: Required<Pick<SearchOptions, "limit">> & SearchOptions
): Promise<PlaceSuggestion[]> {
  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("language", "nl");
  url.searchParams.set("country", "NL,BE");
  if (near) url.searchParams.set("proximity", `${near.lng},${near.lat}`);

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox geocoding returned ${response.status}`);

  const data = await response.json();
  return (data.features ?? []).map((feature: { place_name: string; center: [number, number] }) => ({
    label: feature.place_name,
    lng: feature.center[0],
    lat: feature.center[1],
  }));
}

async function searchWithNominatim(
  query: string,
  { limit, signal }: Required<Pick<SearchOptions, "limit">> & SearchOptions
): Promise<PlaceSuggestion[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);

  const data: { display_name: string; lat: string; lon: string }[] = await response.json();
  return data.map((item) => ({
    label: item.display_name,
    lat: Number.parseFloat(item.lat),
    lng: Number.parseFloat(item.lon),
  }));
}

export interface ReverseGeocodeResult {
  /** Street address, or the raw coordinates when nothing was found. */
  address: string;
  /** ISO 3166-1 alpha-2 country code in lower case, e.g. "nl". */
  countryCode: string | null;
}

/**
 * Look up what is at a coordinate.
 *
 * The country code matters as much as the address: it decides which emergency
 * number the panic button dials.
 */
export async function reverseGeocodeDetailed({
  lat,
  lng,
}: LatLng): Promise<ReverseGeocodeResult> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url);
    if (!response.ok) return { address: fallback, countryCode: null };

    const data = await response.json();
    const code = data?.address?.country_code;

    return {
      address: formatAddress(data?.address) || data?.display_name || fallback,
      countryCode: typeof code === "string" ? code.toLowerCase() : null,
    };
  } catch (error) {
    console.warn("[SafeBuddy] Reverse geocoding failed:", error);
    return { address: fallback, countryCode: null };
  }
}

/** Best-effort street address for a coordinate. Falls back to the raw value. */
export async function reverseGeocode(point: LatLng): Promise<string> {
  return (await reverseGeocodeDetailed(point)).address;
}

interface NominatimAddress {
  road?: string;
  house_number?: string;
  city?: string;
  town?: string;
  village?: string;
}

/** "Kalverstraat 12, Amsterdam" from Nominatim's address parts. */
export function formatAddress(address: NominatimAddress | undefined): string {
  if (!address) return "";

  const parts: string[] = [];
  if (address.road) {
    parts.push(address.house_number ? `${address.road} ${address.house_number}` : address.road);
  }

  const place = address.city || address.town || address.village;
  if (place) parts.push(place);

  return parts.join(", ");
}

export class GeolocationUnavailableError extends Error {}

/** Promise wrapper around the browser geolocation API, with a named address. */
export async function getCurrentLocation(): Promise<NamedLocation> {
  const isSecure =
    window.location.protocol === "https:" || window.location.hostname === "localhost";
  if (!isSecure) throw new GeolocationUnavailableError("insecure-context");
  if (!navigator.geolocation) throw new GeolocationUnavailableError("unsupported");

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 30_000,
      maximumAge: 60_000,
    });
  });

  const point: LatLng = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };

  return { ...point, name: await reverseGeocode(point) };
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
