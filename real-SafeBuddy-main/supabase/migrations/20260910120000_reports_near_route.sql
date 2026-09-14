-- Spatial lookup voor route-scoring.
--
-- De safe-route edge function geocodeerde vroeger elk meldingsadres opnieuw via
-- Nominatim en vergeleek daarna elk routepunt met elke melding. Bij ~15.000
-- meldingen zijn dat miljoenen vergelijkingen plus duizenden HTTP-calls per
-- request.
--
-- Deze functie doet het werk in de database: bouw de route als LineString,
-- en geef alleen de punten terug die binnen de corridor liggen. PostGIS
-- gebruikt daarvoor de bestaande GIST-index op map_points.location.

-- PostGIS staat op Supabase in het schema `extensions`. Zonder deze regel
-- faalt `geography(point, 4326)` met "type does not exist" wanneer je dit
-- bestand handmatig in de SQL Editor plakt.
SET search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.get_reports_near_route(
  route_geojson jsonb,
  radius_meters integer DEFAULT 500
)
RETURNS TABLE (
  id bigint,
  label text,
  report_type text,
  severity text,
  lat double precision,
  lng double precision,
  distance_meters double precision,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH route AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(route_geojson), 4326)::geography AS geom
  )
  SELECT
    mp.id,
    mp.title AS label,
    mp.report_type,
    mp.severity,
    ST_Y(mp.location::geometry) AS lat,
    ST_X(mp.location::geometry) AS lng,
    ST_Distance(mp.location, route.geom) AS distance_meters,
    mp.created_at
  FROM public.map_points mp, route
  WHERE mp.location IS NOT NULL
    -- ST_DWithin op geography rekent in meters en gebruikt de index.
    AND ST_DWithin(mp.location, route.geom, radius_meters)
  ORDER BY distance_meters ASC;
$$;

COMMENT ON FUNCTION public.get_reports_near_route IS
  'Meldingen binnen radius_meters van een route. route_geojson is een GeoJSON LineString in WGS84 ([lng, lat] paren).';

GRANT EXECUTE ON FUNCTION public.get_reports_near_route(jsonb, integer) TO anon, authenticated;

-- Zonder deze index moet elke query de hele tabel scannen.
CREATE INDEX IF NOT EXISTS map_points_location_gist
  ON public.map_points USING GIST (location);

-- safety_reports heeft dezelfde geography-kolom en verdient dezelfde index,
-- zodat een spatial query daar later ook goedkoop is.
CREATE INDEX IF NOT EXISTS safety_reports_location_gist
  ON public.safety_reports USING GIST (location);
