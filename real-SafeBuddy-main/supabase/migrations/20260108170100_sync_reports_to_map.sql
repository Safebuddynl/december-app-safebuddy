-- Database trigger: Automatisch map_point aanmaken bij nieuwe safety_report
-- Dit zorgt ervoor dat elke community report ook als punt op de kaart verschijnt

CREATE OR REPLACE FUNCTION public.sync_report_to_map_point()
RETURNS TRIGGER AS $$
DECLARE
  report_location geography;
BEGIN
  -- Als de report een location heeft, maak dan een map_point aan
  IF NEW.location IS NOT NULL THEN
    INSERT INTO public.map_points (
      owner_id,
      title,
      description,
      report_type,
      severity,
      location,
      upvotes
    )
    VALUES (
      NEW.user_id,
      NEW.report_type,
      NEW.description,
      NEW.report_type,
      NEW.severity,
      NEW.location,
      NEW.upvotes
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Na elke INSERT op safety_reports
CREATE TRIGGER sync_safety_report_to_map
  AFTER INSERT ON public.safety_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_report_to_map_point();

-- Trigger: Bij UPDATE van upvotes, sync naar map_points
CREATE OR REPLACE FUNCTION public.sync_report_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  -- Update het corresponderende map_point (match op location en owner)
  UPDATE public.map_points
  SET upvotes = NEW.upvotes
  WHERE owner_id = NEW.user_id
    AND report_type = NEW.report_type
    AND ST_DWithin(location, NEW.location, 10) -- binnen 10 meter (zelfde locatie)
    AND created_at >= NEW.created_at - INTERVAL '1 minute'
    AND created_at <= NEW.created_at + INTERVAL '1 minute';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_report_upvotes_to_map
  AFTER UPDATE OF upvotes ON public.safety_reports
  FOR EACH ROW
  WHEN (OLD.upvotes IS DISTINCT FROM NEW.upvotes)
  EXECUTE FUNCTION public.sync_report_upvotes();

COMMENT ON FUNCTION public.sync_report_to_map_point IS 'Automatically creates a map_point when a safety_report is created';
COMMENT ON FUNCTION public.sync_report_upvotes IS 'Syncs upvote count from safety_reports to map_points';
