-- Function to get map points with extracted coordinates
CREATE OR REPLACE FUNCTION get_map_points_with_coords(limit_count integer DEFAULT 500)
RETURNS TABLE (
  id bigint,
  title text,
  description text,
  severity text,
  report_type text,
  upvotes integer,
  created_at timestamp with time zone,
  longitude double precision,
  latitude double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    mp.id,
    mp.title,
    mp.description,
    mp.severity,
    mp.report_type,
    mp.upvotes,
    mp.created_at,
    ST_X(mp.location::geometry) as longitude,
    ST_Y(mp.location::geometry) as latitude
  FROM map_points mp
  ORDER BY mp.created_at DESC
  LIMIT limit_count;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_map_points_with_coords(integer) TO anon, authenticated;
