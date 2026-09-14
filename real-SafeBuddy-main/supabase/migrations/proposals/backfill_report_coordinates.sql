-- VOORSTEL - NIET TOEGEPAST
--
-- Vangnet voor meldingen die alleen een tekstadres hebben en geen coördinaten.
--
-- Gemeten op de live database op 2026-09-10:
--   safety_reports zonder location : 0 van 7
--   map_points zonder location     : 0 van 14.905
--
-- Er valt op dit moment dus niets te backfillen. Dit bestand staat er voor het
-- geval er later rijen binnenkomen zonder coördinaten, bijvoorbeeld via een
-- import.
--
-- Waarom dit geen SQL-only oplossing is: geocoderen vereist een externe API,
-- en dat kan Postgres niet. Draai daarom `scripts/backfill-coordinates.mjs`,
-- dat de adressen één keer opzoekt en de coördinaten wegschrijft. Daarna
-- controleer je met de query hieronder of alles gevuld is.

-- 1. Hoeveel rijen missen coördinaten?
SELECT count(*) AS zonder_coordinaten
FROM public.safety_reports
WHERE location IS NULL AND location_address IS NOT NULL;

-- 2. Welke adressen zijn dat?
SELECT id, location_address, created_at
FROM public.safety_reports
WHERE location IS NULL AND location_address IS NOT NULL
ORDER BY created_at DESC;

-- 3. Na het draaien van het backfill-script moet dit 0 teruggeven.
--    Rijen die overblijven hebben een adres dat de geocoder niet herkende;
--    die verschijnen niet op de kaart en tellen niet mee in de routescore.

-- Zodra elke melding coördinaten heeft, kun je de kolom verplicht maken.
-- Doe dit pas als de query hierboven 0 geeft, anders faalt de migration.
--
--   ALTER TABLE public.safety_reports
--     ALTER COLUMN location SET NOT NULL;
