-- Controle na het toepassen van de drie migrations van 2026-09-10.
-- Plak dit in de Supabase SQL Editor. Alles moet "OK" zeggen.

SELECT
  'tabel ' || t AS wat,
  CASE WHEN to_regclass('public.' || t) IS NULL THEN 'ONTBREEKT' ELSE 'OK' END AS status
FROM unnest(ARRAY[
  'trusted_contacts',
  'trip_shares',
  'trip_locations',
  'trip_share_recipients',
  'trip_alerts'
]) AS t

UNION ALL

SELECT
  'functie ' || f,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  ) THEN 'OK' ELSE 'ONTBREEKT' END
FROM unnest(ARRAY[
  'get_reports_near_route',
  'get_shared_trip',
  'get_shared_trip_track',
  'push_trip_location',
  'check_in_trip',
  'extend_trip',
  'process_overdue_trips'
]) AS f

UNION ALL

SELECT
  'index ' || i,
  CASE WHEN to_regclass('public.' || i) IS NULL THEN 'ONTBREEKT' ELSE 'OK' END
FROM unnest(ARRAY[
  'map_points_location_gist',
  'safety_reports_location_gist'
]) AS i

UNION ALL

-- Row level security moet aan staan op alles wat persoonsgegevens bevat.
SELECT
  'RLS op ' || relname,
  CASE WHEN relrowsecurity THEN 'OK' ELSE 'STAAT UIT' END
FROM pg_class
WHERE relname IN ('trusted_contacts', 'trip_shares', 'trip_locations',
                  'trip_share_recipients', 'trip_alerts')
  AND relnamespace = 'public'::regnamespace

ORDER BY 2 DESC, 1;


-- Losse test: geeft de spatial query iets terug voor een route door Amsterdam?
-- Verwacht een handvol rijen. Nul rijen betekent dat map_points leeg is of dat
-- de index niet werkt.
SELECT count(*) AS meldingen_langs_testroute
FROM get_reports_near_route(
  '{"type":"LineString","coordinates":[[4.8930,52.3730],[4.8830,52.3640]]}'::jsonb,
  500
);
