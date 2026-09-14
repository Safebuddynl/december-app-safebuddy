import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Berekent een route en scoort hem op gemelde onveilige plekken.
 *
 * De vorige versie geocodeerde bij elke aanvraag elk meldingsadres opnieuw via
 * Nominatim, laadde alle meldingen in het geheugen en vergeleek daarna elk
 * routepunt met elke melding. Dat zijn duizenden HTTP-calls en miljoenen
 * afstandsberekeningen per request.
 *
 * Nu doet PostGIS het werk: de route gaat als LineString naar de database, en
 * `get_reports_near_route` geeft alleen de punten terug die binnen de corridor
 * liggen. Zie migration 20260910120000_reports_near_route.sql.
 *
 * De scoring en het antwoordformaat zijn onveranderd, zodat bestaande
 * aanroepers blijven werken.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Meldingen binnen deze afstand van de route tellen mee. */
const CORRIDOR_METERS = 500;

/** Aftrek per melding, ongewijzigd ten opzichte van de vorige versie. */
const SEVERITY_PENALTY: Record<string, number> = { high: 30, medium: 15, low: 5 };

/** Gemiddelde snelheid per vervoerswijze, in km/u. */
const SPEED_KMH: Record<string, number> = { car: 50, bike: 15, foot: 5 };

const OSRM_PROFILE: Record<string, string> = {
  car: "driving",
  bike: "cycling",
  foot: "walking",
};

interface NearbyReport {
  id: number;
  label: string;
  report_type: string;
  severity: string;
  lat: number;
  lng: number;
  distance_meters: number;
  created_at: string;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { startLat, startLng, destLat, destLng, travelMode = "foot" } = await request.json();

    if (![startLat, startLng, destLat, destLng].every((n) => typeof n === "number")) {
      return json({ error: "startLat, startLng, destLat en destLng zijn verplicht" }, 400);
    }

    const routes = await fetchRoutes(startLat, startLng, destLat, destLng, travelMode);
    if (routes.length === 0) {
      return json({ error: "Could not calculate route" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Elke alternatieve route apart scoren, en de veiligste kiezen.
    const scored = [];
    for (const route of routes) {
      // OSRM geeft GeoJSON [lng, lat]; die volgorde gaat ongewijzigd naar
      // PostGIS, dat dezelfde conventie gebruikt.
      const geoJsonCoordinates: [number, number][] = route.geometry.coordinates;

      const reports = await fetchNearbyReports(supabase, geoJsonCoordinates);
      const safety = scoreRoute(reports);

      scored.push({
        // De rest van de app werkt met [lat, lng], dus hier omdraaien.
        coordinates: geoJsonCoordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
        safety,
        distance: route.distance,
      });
    }

    scored.sort((a, b) => b.safety.score - a.safety.score);
    const best = scored[0];

    const distanceKm = best.distance / 1000;
    const speed = SPEED_KMH[travelMode] ?? SPEED_KMH.car;
    const durationMinutes = Math.max(1, Math.round((distanceKm / speed) * 60));

    return json({
      coordinates: best.coordinates,
      distance: distanceKm.toFixed(2) + " km",
      duration: durationMinutes + " min",
      safetyScore: best.safety.score,
      dangerousAreas: best.safety.dangerousAreas,
      message:
        best.safety.score < 70
          ? "Warning: This route passes near reported safety concerns"
          : best.safety.score < 90
            ? "Route is relatively safe with minor concerns"
            : "Route is clear of safety concerns",
    });
  } catch (error) {
    console.error("safe-route failed:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

interface OsrmRoute {
  distance: number;
  geometry: { coordinates: [number, number][] };
}

/** Vraag OSRM om routes, inclusief alternatieven. */
async function fetchRoutes(
  startLat: number,
  startLng: number,
  destLat: number,
  destLng: number,
  travelMode: string
): Promise<OsrmRoute[]> {
  const profile = OSRM_PROFILE[travelMode] ?? OSRM_PROFILE.car;
  const url =
    `https://router.project-osrm.org/route/v1/${profile}/` +
    `${startLng},${startLat};${destLng},${destLat}` +
    "?overview=full&geometries=geojson&alternatives=true";

  const response = await fetch(url);
  const data = await response.json();

  if (data.code !== "Ok" || !Array.isArray(data.routes)) return [];
  return data.routes;
}

/**
 * Meldingen binnen de corridor rond de route, opgehaald met één spatial query.
 *
 * Een LineString heeft minstens twee punten nodig; bij minder valt er niets
 * te vergelijken.
 */
async function fetchNearbyReports(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  coordinates: [number, number][]
): Promise<NearbyReport[]> {
  if (coordinates.length < 2) return [];

  const { data, error } = await supabase.rpc("get_reports_near_route", {
    route_geojson: { type: "LineString", coordinates },
    radius_meters: CORRIDOR_METERS,
  });

  if (error) {
    console.error("get_reports_near_route failed:", error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Trek per melding punten af, zwaarste eerst.
 *
 * Elke melding telt één keer, ook als de route er meerdere keren langskomt.
 * De database geeft ze al ontdubbeld terug.
 */
function scoreRoute(reports: NearbyReport[]): { score: number; dangerousAreas: string[] } {
  let score = 100;
  const dangerousAreas: string[] = [];

  for (const report of reports) {
    const severity = String(report.severity ?? "").toLowerCase();
    score -= SEVERITY_PENALTY[severity] ?? SEVERITY_PENALTY.low;

    if (severity === "high") {
      dangerousAreas.push(`${report.report_type} (High risk) near ${report.label}`);
    } else if (severity === "medium") {
      dangerousAreas.push(`${report.report_type} (Medium risk) near ${report.label}`);
    }
  }

  return { score: Math.max(0, score), dangerousAreas };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
