-- VOORSTEL - NIET TOEGEPAST
--
-- Ruimt alles op wat alleen bestond voor de gezichts- en ID-verificatie die in
-- fase 2 uit de app is gehaald. De code roept niets hiervan meer aan, dus deze
-- objecten zijn nu ongebruikt.
--
-- LET OP, dit is onomkeerbaar:
--   * `user_verifications` kan ingezonden ID-bewijzen van echte gebruikers
--     bevatten. Controleer eerst hoeveel rijen erin staan.
--   * De bucket `verification-documents` bevat de geuploade documenten en
--     selfies zelf. Onder de AVG is verwijderen hier waarschijnlijk juist
--     gewenst, maar controleer of je een bewaarplicht hebt.
--
-- Tel eerst wat je weggooit:
--   SELECT count(*) FROM public.user_verifications;
--   SELECT count(*) FROM storage.objects WHERE bucket_id = 'verification-documents';

BEGIN;

-- 1. De geuploade bestanden. Moet vóór de bucket zelf.
DELETE FROM storage.objects WHERE bucket_id = 'verification-documents';

-- 2. De policies op die bucket.
DROP POLICY IF EXISTS "Users can upload their own verification documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own verification documents" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'verification-documents';

-- 3. De tabel met de aanvragen.
DROP TRIGGER IF EXISTS update_user_verifications_updated_at ON public.user_verifications;
DROP TABLE IF EXISTS public.user_verifications;

-- 4. Het enum, dat nergens anders gebruikt wordt.
DROP TYPE IF EXISTS public.verification_status;

-- 5. De kolommen op profiles die de verificatiestatus spiegelden.
--    Sla deze twee regels over als je later een andere vorm van verificatie
--    wilt bouwen en de vlag wilt bewaren.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_verified;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS verification_submitted_at;

COMMIT;

-- Na het toepassen: genereer de types opnieuw, anders klopt types.ts niet meer.
--   npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts
