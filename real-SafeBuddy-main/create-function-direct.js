import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'db.irrinahkpkuaqcrlovph.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'JanWillem2006!',
  ssl: { rejectUnauthorized: false }
});

async function createFunction() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    const sql = `
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
`;
    
    console.log('🔧 Creating function...');
    await client.query(sql);
    console.log('✅ Function created!');
    
    console.log('🔐 Granting permissions...');
    await client.query('GRANT EXECUTE ON FUNCTION get_all_map_points_with_coords(integer) TO anon, authenticated;');
    console.log('✅ Permissions granted!');
    
    console.log('\n🧪 Testing function...');
    const result = await client.query('SELECT * FROM get_all_map_points_with_coords(3)');
    console.log('✅ Function works! Sample data:');
    console.log(JSON.stringify(result.rows, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

createFunction();
