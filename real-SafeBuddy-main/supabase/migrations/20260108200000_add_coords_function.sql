-- Function to get all map points with extracted lat/lng coordinates
CREATE OR REPLACE FUNCTION get_all_map_points_with_coords(max_points integer DEFAULT 1000)
RETURNS TABLE (
  id bigint,
  title text,
  description text,
  severity text,
  report_type text,
  upvotes integer,
  created_at timestamptz,
  lat double precision,
  lng double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    mp.id,
    mp.title,
    mp.description,
    mp.severity,
    mp.report_type,
    mp.upvotes,
    mp.created_at,
    ST_Y(mp.location::geometry) as lat,
    ST_X(mp.location::geometry) as lng
  FROM map_points mp
  WHERE mp.location IS NOT NULL
  ORDER BY mp.created_at DESC
  LIMIT max_points;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_all_map_points_with_coords(integer) TO anon, authenticated;

COMMENT ON FUNCTION get_all_map_points_with_coords IS 'Get map points with extracted latitude and longitude coordinates';
