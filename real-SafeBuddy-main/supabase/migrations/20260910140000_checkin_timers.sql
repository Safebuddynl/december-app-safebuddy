-- Check-in timers: "ik ben over 30 minuten thuis".
--
-- Bouwt voort op trip_shares uit 20260910130000. De verwachte aankomsttijd
-- staat daar al; hier komt de afmeldstatus bij, plus de controle die de
-- contacten waarschuwt als die afmelding uitblijft.

-- PostGIS staat op Supabase in het schema `extensions`. Zonder deze regel
-- faalt `geography(point, 4326)` met "type does not exist" wanneer je dit
-- bestand handmatig in de SQL Editor plakt.
SET search_path = public, extensions;

ALTER TABLE public.trip_shares
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

COMMENT ON COLUMN public.trip_shares.checked_in_at IS
  'Wanneer de reiziger zich veilig heeft afgemeld. NULL betekent nog onderweg.';
COMMENT ON COLUMN public.trip_shares.alerted_at IS
  'Wanneer de contacten zijn gewaarschuwd. Voorkomt dat er meermaals wordt gealarmeerd.';

-- De wachtrij met verstuurde waarschuwingen. Een aparte tabel zodat het
-- daadwerkelijke versturen (mail, sms, push) losstaat van de detectie.
CREATE TABLE IF NOT EXISTS public.trip_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_share_id uuid NOT NULL REFERENCES public.trip_shares(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.trusted_contacts(id) ON DELETE SET NULL,

  contact_name text NOT NULL,
  contact_phone text,
  contact_email text,

  -- De laatst bekende positie op het moment van alarmeren, zodat die bewaard
  -- blijft ook als de rit daarna nog verandert.
  last_lat double precision,
  last_lng double precision,
  last_location_at timestamptz,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  error text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_alerts_pending_idx
  ON public.trip_alerts (created_at) WHERE status = 'pending';

ALTER TABLE public.trip_alerts ENABLE ROW LEVEL SECURITY;

-- Alleen de eigenaar van de rit ziet zijn eigen waarschuwingen.
DROP POLICY IF EXISTS "Eigenaar ziet eigen waarschuwingen" ON public.trip_alerts;
CREATE POLICY "Eigenaar ziet eigen waarschuwingen"
  ON public.trip_alerts FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_shares t
    WHERE t.id = trip_share_id AND t.user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Afmelden en verlengen
-- ---------------------------------------------------------------------------

-- Afmelden: de rit is voorbij, niemand hoeft gewaarschuwd te worden.
CREATE OR REPLACE FUNCTION public.check_in_trip(trip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trip_shares
     SET checked_in_at = now(),
         status = 'completed',
         ended_at = now()
   WHERE id = trip_id
     AND user_id = auth.uid()
     AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rit niet gevonden of niet actief';
  END IF;
END;
$$;

-- Verlengen: het duurt langer dan gedacht.
CREATE OR REPLACE FUNCTION public.extend_trip(trip_id uuid, extra_minutes integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_arrival timestamptz;
BEGIN
  IF extra_minutes < 1 OR extra_minutes > 720 THEN
    RAISE EXCEPTION 'extra_minutes moet tussen 1 en 720 liggen';
  END IF;

  UPDATE public.trip_shares
     SET expected_arrival = greatest(coalesce(expected_arrival, now()), now())
                            + make_interval(mins => extra_minutes),
         -- Opnieuw kunnen alarmeren als de nieuwe tijd ook verstrijkt.
         alerted_at = NULL
   WHERE id = trip_id
     AND user_id = auth.uid()
     AND status = 'active'
  RETURNING expected_arrival INTO new_arrival;

  IF new_arrival IS NULL THEN
    RAISE EXCEPTION 'Rit niet gevonden of niet actief';
  END IF;

  RETURN new_arrival;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_trip(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- De controle
-- ---------------------------------------------------------------------------

-- Zoekt ritten waarvan de verwachte aankomst verstreken is zonder afmelding,
-- en zet voor elk gekoppeld contact een waarschuwing klaar.
--
-- SECURITY DEFINER omdat dit door de planner draait, niet namens een gebruiker.
CREATE OR REPLACE FUNCTION public.process_overdue_trips(grace_minutes integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  alerts_created integer := 0;
BEGIN
  WITH overdue AS (
    SELECT t.id
      FROM public.trip_shares t
     WHERE t.status = 'active'
       AND t.checked_in_at IS NULL
       AND t.alerted_at IS NULL
       AND t.expected_arrival IS NOT NULL
       -- De coulanceperiode voorkomt alarm bij een minuut vertraging.
       AND t.expected_arrival + make_interval(mins => grace_minutes) < now()
     FOR UPDATE SKIP LOCKED
  ),
  inserted AS (
    INSERT INTO public.trip_alerts (
      trip_share_id, contact_id, contact_name, contact_phone, contact_email,
      last_lat, last_lng, last_location_at
    )
    SELECT
      t.id,
      c.id,
      c.contact_name,
      c.contact_phone,
      c.contact_email,
      ST_Y(t.last_location::geometry),
      ST_X(t.last_location::geometry),
      t.last_location_at
    FROM overdue o
    JOIN public.trip_shares t ON t.id = o.id
    JOIN public.trip_share_recipients r ON r.trip_share_id = t.id
    JOIN public.trusted_contacts c ON c.id = r.contact_id
    RETURNING 1
  ),
  marked AS (
    UPDATE public.trip_shares t
       SET alerted_at = now()
      FROM overdue o
     WHERE t.id = o.id
    RETURNING 1
  )
  SELECT count(*) INTO alerts_created FROM inserted;

  RETURN alerts_created;
END;
$$;

COMMENT ON FUNCTION public.process_overdue_trips IS
  'Zet waarschuwingen klaar voor ritten waarvan de check-in is verstreken. Bedoeld voor een planner, niet voor de client.';

-- Bewust géén GRANT naar anon of authenticated: alleen de planner of een
-- edge function met de service-role key mag dit aanroepen.

-- ---------------------------------------------------------------------------
-- Inplannen
-- ---------------------------------------------------------------------------
--
-- Optie A, in de database met pg_cron. Zet de extensie eerst aan in het
-- Supabase-dashboard onder Database > Extensions, en haal dan het commentaar
-- hieronder weg:
--
--   SELECT cron.schedule(
--     'safebuddy-overdue-trips',
--     '* * * * *',
--     $cron$ SELECT public.process_overdue_trips(5); $cron$
--   );
--
-- Optie B, via de edge function supabase/functions/check-overdue-trips, die
-- deze functie aanroept en de waarschuwingen daarna daadwerkelijk verstuurt.
-- Plan die in met een externe cron of met pg_cron plus pg_net.
