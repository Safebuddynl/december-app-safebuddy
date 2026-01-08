-- Enable PostGIS extension for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Update safety_reports table to use PostGIS geography type
ALTER TABLE public.safety_reports 
ADD COLUMN IF NOT EXISTS location geography(point, 4326);

-- Add GiST index for fast spatial queries (within radius, bounding box, etc.)
CREATE INDEX IF NOT EXISTS safety_reports_location_gix
ON public.safety_reports
USING gist (location);

-- Create map_points table for additional map data (14K+ points)
CREATE TABLE IF NOT EXISTS public.map_points (
  id bigserial PRIMARY KEY,
  owner_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  report_type text NOT NULL, -- 'harassment', 'theft', 'assault', 'unsafe_area', etc.
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  location geography(point, 4326) NOT NULL,
  upvotes integer DEFAULT 0,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on map_points
ALTER TABLE public.map_points ENABLE ROW LEVEL SECURITY;

-- RLS policies for map_points
-- Everyone can read all map points (public safety data)
CREATE POLICY "Anyone can view map points"
ON public.map_points FOR SELECT
USING (true);

-- Authenticated users can insert their own points
CREATE POLICY "Authenticated users can create map points"
ON public.map_points FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

-- Users can update their own points
CREATE POLICY "Users can update own map points"
ON public.map_points FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

-- Users can delete their own points
CREATE POLICY "Users can delete own map points"
ON public.map_points FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Add GiST index for fast spatial queries on map_points
CREATE INDEX map_points_location_gix
ON public.map_points
USING gist (location);

-- Create index on report_type for filtering
CREATE INDEX map_points_report_type_idx
ON public.map_points (report_type);

-- Create index on severity for filtering
CREATE INDEX map_points_severity_idx
ON public.map_points (severity);

-- Add trigger for updated_at on map_points
CREATE TRIGGER handle_map_points_updated_at
  BEFORE UPDATE ON public.map_points
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Helper function: Get points within radius (distance in meters)
CREATE OR REPLACE FUNCTION public.get_points_in_radius(
  lng double precision,
  lat double precision,
  radius_meters integer DEFAULT 2000
)
RETURNS TABLE (
  id bigint,
  title text,
  description text,
  report_type text,
  severity text,
  longitude double precision,
  latitude double precision,
  upvotes integer,
  is_verified boolean,
  distance_meters double precision,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.id,
    mp.title,
    mp.description,
    mp.report_type,
    mp.severity,
    ST_X(mp.location::geometry) as longitude,
    ST_Y(mp.location::geometry) as latitude,
    mp.upvotes,
    mp.is_verified,
    ST_Distance(
      mp.location,
      ST_MakePoint(lng, lat)::geography
    ) as distance_meters,
    mp.created_at
  FROM public.map_points mp
  WHERE ST_DWithin(
    mp.location,
    ST_MakePoint(lng, lat)::geography,
    radius_meters
  )
  ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function: Get points within bounding box (viewport)
CREATE OR REPLACE FUNCTION public.get_points_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
RETURNS TABLE (
  id bigint,
  title text,
  description text,
  report_type text,
  severity text,
  longitude double precision,
  latitude double precision,
  upvotes integer,
  is_verified boolean,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.id,
    mp.title,
    mp.description,
    mp.report_type,
    mp.severity,
    ST_X(mp.location::geometry) as longitude,
    ST_Y(mp.location::geometry) as latitude,
    mp.upvotes,
    mp.is_verified,
    mp.created_at
  FROM public.map_points mp
  WHERE mp.location && ST_MakeEnvelope(
    min_lng, min_lat,
    max_lng, max_lat,
    4326
  )::geography;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to upvote a map point
CREATE OR REPLACE FUNCTION public.upvote_map_point(point_id bigint)
RETURNS void AS $$
BEGIN
  UPDATE public.map_points
  SET upvotes = upvotes + 1
  WHERE id = point_id;
END;
$$ LANGUAGE plpgsql;

-- Comment: Add similar functions for safety_reports if needed
COMMENT ON FUNCTION public.get_points_in_radius IS 'Get all map points within a radius (meters) from a given coordinate';
COMMENT ON FUNCTION public.get_points_in_bbox IS 'Get all map points within a bounding box (useful for map viewport queries)';
COMMENT ON TABLE public.map_points IS 'Stores geographic safety data points with PostGIS support for efficient spatial queries';
