const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = "https://irrinahkpkuaqcrlovph.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycmluYWhrcGt1YXFjcmxvdnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcyNDc1NSwiZXhwIjoyMDUxMzAwNzU1fQ.oX3bd2-ad78-e4ec5c8ffa99_V-5LtcJ-0iNaNwgOkiZs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function createFunction() {
  console.log("Creating get_map_points_with_coords function...");
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
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
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        RETURN QUERY
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
      END;
      $$;
    `
  });

  if (error) {
    console.error("❌ Error creating function:", error);
    
    // Try direct SQL approach
    console.log("Trying direct SQL creation...");
    const { error: directError } = await supabase.rpc('exec_sql', {
      sql: `
        DROP FUNCTION IF EXISTS get_map_points_with_coords(integer);
        
        CREATE FUNCTION get_map_points_with_coords(limit_count integer DEFAULT 500)
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
      `
    });
    
    if (directError) {
      console.error("❌ Direct SQL also failed:", directError);
    } else {
      console.log("✅ Function created successfully via direct SQL!");
    }
  } else {
    console.log("✅ Function created successfully!");
  }
}

createFunction();
