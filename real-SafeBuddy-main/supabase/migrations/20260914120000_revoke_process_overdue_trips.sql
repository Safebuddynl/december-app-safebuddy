-- Beveiligingsfix.
--
-- Postgres geeft nieuwe functies standaard EXECUTE aan de rol PUBLIC. In
-- 20260910140000 stond wel de opmerking dat process_overdue_trips niet voor
-- anon bedoeld is, maar er stond geen REVOKE bij. Gemeten op 2026-09-14 gaf
-- een anonieme aanroep gewoon status 200.
--
-- De functie draait als SECURITY DEFINER en maakt waarschuwingen aan. Een
-- willekeurige bezoeker hoort dat niet te kunnen starten. Alleen de planner of
-- een edge function met de service-role key mag dit.

REVOKE ALL ON FUNCTION public.process_overdue_trips(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_overdue_trips(integer) FROM anon;
REVOKE ALL ON FUNCTION public.process_overdue_trips(integer) FROM authenticated;

-- Zelfde behandeling voor alles wat later wordt aangemaakt in dit schema, zodat
-- deze fout niet opnieuw ontstaat bij de volgende SECURITY DEFINER functie.
-- Let op: dit geldt alleen voor functies die ná deze regel worden aangemaakt.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- De functies die de app wél nodig heeft, houden hun rechten. Expliciet
-- opnieuw toekennen, voor het geval de regel hierboven ze zou raken.
GRANT EXECUTE ON FUNCTION public.get_reports_near_route(jsonb, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_trip(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_trip_track(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_trip_location(uuid, double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_in_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_trip(uuid, integer) TO authenticated;
