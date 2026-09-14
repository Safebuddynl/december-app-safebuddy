-- Allow anonymous read access to the imported historic KRO dataset.
--
-- The table name is "KRO_Reports_15K". An earlier version of this migration
-- referred to "KRO_Reports_1SK", which does not exist, so the whole migration
-- failed and the app could not read the data.

ALTER TABLE public."KRO_Reports_15K" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for KRO_Reports_15K" ON public."KRO_Reports_15K";

CREATE POLICY "Public read access for KRO_Reports_15K"
  ON public."KRO_Reports_15K"
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public."KRO_Reports_15K" TO anon, authenticated;

-- The dataset is read-only for the app: it has no upvotes column and no
-- per-row ownership, so no INSERT/UPDATE/DELETE policies are granted.
