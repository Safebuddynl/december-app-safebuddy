-- Live locatie delen: "volg mijn rit".
--
-- Datamodel
--   trip_shares     één deelbare rit, met status, bestemming en laatste positie
--   trip_locations  het spoor dat is afgelegd, voor de kaart van de kijker
--
-- Beveiliging
--   Een deellink wordt geopend door iemand die niet is ingelogd. Die krijgt
--   daarom géén directe tabeltoegang. Alles loopt via de SECURITY DEFINER
--   functies onderaan, die alleen antwoorden bij een geldig token van een
--   actieve rit. Zo kan een kijker nooit iets anders zien dan die ene rit, en
--   kan niemand de tabel afstruinen.
--
--   Het token is 32 willekeurige bytes in base64url. Raden is niet haalbaar.

-- PostGIS staat op Supabase in het schema `extensions`. Zonder deze regel
-- faalt `geography(point, 4326)` met "type does not exist" wanneer je dit
-- bestand handmatig in de SQL Editor plakt.
SET search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

-- trusted_contacts staat wel in de oudste migration, maar is nooit op de
-- database terechtgekomen: gecontroleerd op 2026-09-14, PostgREST kent hem
-- niet. De tabellen hieronder hebben een foreign key naar deze tabel, dus
-- maak hem hier aan als hij ontbreekt. Bestaat hij al, dan doet dit niets.
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_phone text,
  contact_email text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trusted_contacts_user_idx ON public.trusted_contacts (user_id);

CREATE TABLE IF NOT EXISTS public.trip_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Het geheim in de deellink.
  share_token text NOT NULL UNIQUE,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),

  -- Waar de rit heen gaat, om aan de kijker te tonen.
  destination_address text,
  destination geography(point, 4326),

  -- Laatst doorgegeven positie. Wordt tijdens de rit steeds overschreven.
  last_location geography(point, 4326),
  last_location_at timestamptz,

  started_at timestamptz NOT NULL DEFAULT now(),
  -- Verwachte aankomst. Fase 6 gebruikt dit voor de check-in timer.
  expected_arrival timestamptz,
  ended_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trip_shares IS
  'Een gedeelde rit. Wie het share_token heeft, kan de live locatie volgen.';

-- Het spoor. Apart van trip_shares zodat de laatste positie goedkoop te
-- updaten is en de geschiedenis toch bewaard blijft.
CREATE TABLE IF NOT EXISTS public.trip_locations (
  id bigserial PRIMARY KEY,
  trip_share_id uuid NOT NULL REFERENCES public.trip_shares(id) ON DELETE CASCADE,
  location geography(point, 4326) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Welke contacten bij deze rit horen, zodat fase 6 weet wie te waarschuwen.
CREATE TABLE IF NOT EXISTS public.trip_share_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_share_id uuid NOT NULL REFERENCES public.trip_shares(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.trusted_contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_share_id, contact_id)
);

CREATE INDEX IF NOT EXISTS trip_shares_user_idx ON public.trip_shares (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS trip_shares_active_idx ON public.trip_shares (status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS trip_locations_trip_idx ON public.trip_locations (trip_share_id, recorded_at DESC);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

ALTER TABLE public.trip_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_share_recipients ENABLE ROW LEVEL SECURITY;

-- Alleen de eigenaar heeft directe toegang. Kijkers komen er via de functies.
DROP POLICY IF EXISTS "Eigenaar beheert eigen ritten" ON public.trip_shares;
CREATE POLICY "Eigenaar beheert eigen ritten"
  ON public.trip_shares FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Eigenaar beheert eigen spoor" ON public.trip_locations;
CREATE POLICY "Eigenaar beheert eigen spoor"
  ON public.trip_locations FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_shares t
    WHERE t.id = trip_share_id AND t.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trip_shares t
    WHERE t.id = trip_share_id AND t.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Eigenaar beheert eigen ontvangers" ON public.trip_share_recipients;
CREATE POLICY "Eigenaar beheert eigen ontvangers"
  ON public.trip_share_recipients FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_shares t
    WHERE t.id = trip_share_id AND t.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trip_shares t
    WHERE t.id = trip_share_id AND t.user_id = auth.uid()
  ));

-- trusted_contacts had nog geen policies.
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigenaar beheert eigen contacten" ON public.trusted_contacts;
CREATE POLICY "Eigenaar beheert eigen contacten"
  ON public.trusted_contacts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Toegang voor de kijker met een deellink
-- ---------------------------------------------------------------------------

-- Geeft precies één rit terug, en alleen als het token klopt en de rit loopt.
-- SECURITY DEFINER omdat de aanroeper niet is ingelogd; de WHERE hieronder is
-- de enige toegang die dat oplevert.
CREATE OR REPLACE FUNCTION public.get_shared_trip(token text)
RETURNS TABLE (
  status text,
  destination_address text,
  dest_lat double precision,
  dest_lng double precision,
  last_lat double precision,
  last_lng double precision,
  last_location_at timestamptz,
  started_at timestamptz,
  expected_arrival timestamptz,
  ended_at timestamptz,
  owner_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    t.status,
    t.destination_address,
    ST_Y(t.destination::geometry),
    ST_X(t.destination::geometry),
    ST_Y(t.last_location::geometry),
    ST_X(t.last_location::geometry),
    t.last_location_at,
    t.started_at,
    t.expected_arrival,
    t.ended_at,
    p.username
  FROM public.trip_shares t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE t.share_token = token
    -- Een afgeronde of geannuleerde rit is niet meer te volgen. De link
    -- vervalt dus vanzelf zodra de gebruiker stopt met delen.
    AND t.status = 'active'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_shared_trip IS
  'De actieve rit achter een deellink. Geeft niets terug bij een onbekend token of een beëindigde rit.';

-- Het afgelegde spoor, zodat de kijker de route ziet en niet alleen een stip.
CREATE OR REPLACE FUNCTION public.get_shared_trip_track(token text, max_points integer DEFAULT 200)
RETURNS TABLE (lat double precision, lng double precision, recorded_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    ST_Y(l.location::geometry),
    ST_X(l.location::geometry),
    l.recorded_at
  FROM public.trip_locations l
  JOIN public.trip_shares t ON t.id = l.trip_share_id
  WHERE t.share_token = token
    AND t.status = 'active'
  ORDER BY l.recorded_at DESC
  LIMIT least(greatest(max_points, 1), 1000);
$$;

-- De kijker mag alleen deze twee functies aanroepen, verder niets.
GRANT EXECUTE ON FUNCTION public.get_shared_trip(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_trip_track(text, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Positie doorgeven
-- ---------------------------------------------------------------------------

-- Schrijft de nieuwe positie weg én voegt hem toe aan het spoor, in één
-- aanroep. Alleen de eigenaar van de rit kan dit.
CREATE OR REPLACE FUNCTION public.push_trip_location(
  trip_id uuid,
  lat double precision,
  lng double precision
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  point geography;
BEGIN
  point := ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;

  UPDATE public.trip_shares
     SET last_location = point,
         last_location_at = now()
   WHERE id = trip_id
     AND user_id = auth.uid()
     AND status = 'active';

  -- Geen rij geraakt betekent: niet van jou, of de rit loopt niet meer.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rit niet gevonden of niet actief';
  END IF;

  INSERT INTO public.trip_locations (trip_share_id, location)
  VALUES (trip_id, point);
END;
$$;

GRANT EXECUTE ON FUNCTION public.push_trip_location(uuid, double precision, double precision) TO authenticated;

-- Realtime voor de eigenaar. De kijker is niet ingelogd en haalt de stand op
-- via get_shared_trip; realtime respecteert RLS en zou hem niets sturen.
-- Toevoegen aan de realtime-publicatie faalt als hij er al in zit, dus eerst
-- controleren. Zo blijft de migration herhaalbaar.
DO $realtime$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'trip_shares'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_shares;
  END IF;
END
$realtime$;
