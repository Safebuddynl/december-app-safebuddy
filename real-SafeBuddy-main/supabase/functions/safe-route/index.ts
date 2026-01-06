import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SafetyReport {
  id: string;
  location_address: string;
  severity: string;
  report_type: string;
  created_at: string;
}

interface Location {
  lat: number;
  lng: number;
}

// Calculate distance between two points in km using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Geocode an address using Nominatim
async function geocodeAddress(address: string): Promise<Location | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`
    );
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
  } catch (error) {
    console.error("Geocoding error:", error);
  }
  return null;
}

// Calculate safety score for a route based on nearby reports
async function calculateRouteSafety(
  coordinates: [number, number][],
  reports: SafetyReport[]
): Promise<{ score: number; dangerousAreas: string[] }> {
  let score = 100;
  const dangerousAreas: string[] = [];
  const reportLocations: Map<string, Location> = new Map();

  // Geocode all report locations
  for (const report of reports) {
    if (!reportLocations.has(report.location_address)) {
      const location = await geocodeAddress(report.location_address);
      if (location) {
        reportLocations.set(report.location_address, location);
      }
    }
  }

  // Check each point on the route
  for (const [lat, lng] of coordinates) {
    for (const report of reports) {
      const reportLocation = reportLocations.get(report.location_address);
      if (!reportLocation) continue;

      const distance = calculateDistance(lat, lng, reportLocation.lat, reportLocation.lng);
      
      // If route passes within 500m of a report
      if (distance < 0.5) {
        // Deduct points based on severity
        if (report.severity === "high") {
          score -= 30;
          dangerousAreas.push(`${report.report_type} (High risk) near ${report.location_address}`);
        } else if (report.severity === "medium") {
          score -= 15;
          dangerousAreas.push(`${report.report_type} (Medium risk) near ${report.location_address}`);
        } else {
          score -= 5;
        }
      }
    }
  }

  return { score: Math.max(0, score), dangerousAreas };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startLat, startLng, destLat, destLng, travelMode = "foot" } = await req.json();

    console.log(`Calculating route for travel mode: ${travelMode}`);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Fetch all safety reports
    const { data: reports, error: reportsError } = await supabaseClient
      .from("safety_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (reportsError) {
      console.error("Error fetching reports:", reportsError);
    }

    const safetyReports: SafetyReport[] = reports || [];

    // Map our modes to OSRM profiles
    const profileMap: Record<string, string> = {
      car: "driving",
      bike: "cycling",
      foot: "walking",
    };

    const osrmProfile = profileMap[travelMode] || "driving";

    const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=true`;
    
    console.log(`Routing URL: ${osrmUrl}`);
    
    const mainRouteResponse = await fetch(osrmUrl);
    const mainRouteData = await mainRouteResponse.json();
    
    console.log(`OSRM response code: ${mainRouteData.code}, routes: ${mainRouteData.routes?.length || 0}`);

    if (mainRouteData.code !== "Ok" || !mainRouteData.routes || mainRouteData.routes.length === 0) {
      return new Response(
        JSON.stringify({ error: "Could not calculate route" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Evaluate all alternative routes
    const routesWithSafety = await Promise.all(
      mainRouteData.routes.map(async (route: any) => {
        const coordinates: [number, number][] = route.geometry.coordinates.map(
          (coord: number[]) => [coord[1], coord[0]] // Convert [lng, lat] to [lat, lng]
        );

        const safety = await calculateRouteSafety(coordinates, safetyReports);

        return {
          route,
          coordinates,
          safety,
          distance: route.distance,
          duration: route.duration,
        };
      })
    );

    // Sort by safety score (higher is better)
    routesWithSafety.sort((a, b) => b.safety.score - a.safety.score);

    // Return the safest route
    const bestRoute = routesWithSafety[0];

    // Compute duration based on travel mode speeds
    const distanceKm = bestRoute.distance / 1000;
    let speedKmh = 50; // default car
    if (travelMode === "bike") speedKmh = 15;
    if (travelMode === "foot") speedKmh = 5;
    const durationMinutes = Math.max(1, Math.round((distanceKm / speedKmh) * 60));

    return new Response(
      JSON.stringify({
        coordinates: bestRoute.coordinates,
        distance: distanceKm.toFixed(2) + " km",
        duration: durationMinutes + " min",
        safetyScore: bestRoute.safety.score,
        dangerousAreas: bestRoute.safety.dangerousAreas,
        message:
          bestRoute.safety.score < 70
            ? "Warning: This route passes near reported safety concerns"
            : bestRoute.safety.score < 90
            ? "Route is relatively safe with minor concerns"
            : "Route is clear of safety concerns",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in safe-route function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
