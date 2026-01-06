-- Add last_username_change column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_username_change TIMESTAMPTZ;

-- Trigger function to enforce 30-day cooldown and stamp change time
CREATE OR REPLACE FUNCTION public.enforce_username_cooldown()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF OLD.last_username_change IS NOT NULL AND (NOW() - OLD.last_username_change) < INTERVAL '30 days' THEN
      RAISE EXCEPTION 'Username can only be changed once every 30 days';
    END IF;
    NEW.last_username_change = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create/replace trigger on profiles before update
DROP TRIGGER IF EXISTS trg_username_cooldown ON public.profiles;
CREATE TRIGGER trg_username_cooldown
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_username_cooldown();
