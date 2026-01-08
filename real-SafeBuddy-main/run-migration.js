import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const supabaseUrl = "https://irrinahkpkuaqcrlovph.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycmluYWhrcGt1YXFjcmxvdnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcyNDc1NSwiZXhwIjoyMDUxMzAwNzU1fQ.oX3bd2-ad78-e4ec5c8ffa99_V-5LtcJ-0iNaNwgOkiZs";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log("📝 Reading migration file...");
  const sql = readFileSync("supabase/migrations/20260108200000_add_coords_function.sql", "utf8");
  
  console.log("🔧 Creating function in database...");
  console.log(sql);
  
  // Split the SQL by semicolons and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));
  
  for (const statement of statements) {
    if (statement.includes('CREATE OR REPLACE FUNCTION')) {
      console.log("\n🔨 Executing CREATE FUNCTION...");
      
      // Use raw SQL execution via PostgREST
      const { data, error } = await supabase.rpc('exec', { 
        sql: statement + ';' 
      });
      
      if (error) {
        console.error("❌ Error:", error);
        
        // Try alternative: direct API call
        console.log("Trying direct SQL execution...");
        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
            method: 'POST',
            headers: {
              'apikey': supabaseServiceKey,
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ query: statement + ';' })
          });
          
          if (!response.ok) {
            const text = await response.text();
            console.error("❌ API call failed:", text);
          } else {
            console.log("✅ Function created via API!");
          }
        } catch (apiError) {
          console.error("❌ API error:", apiError);
        }
      } else {
        console.log("✅ Function created successfully!");
      }
    } else if (statement.includes('GRANT')) {
      console.log("\n🔐 Granting permissions...");
      const { error: grantError } = await supabase.rpc('exec', { 
        sql: statement + ';' 
      });
      
      if (grantError) {
        console.error("⚠️ Grant warning:", grantError.message);
      } else {
        console.log("✅ Permissions granted!");
      }
    }
  }
  
  // Test the function
  console.log("\n🧪 Testing function...");
  const { data: testData, error: testError } = await supabase
    .rpc('get_all_map_points_with_coords', { max_points: 3 });
  
  if (testError) {
    console.error("❌ Test failed:", testError);
  } else {
    console.log("✅ Function works! Sample data:");
    console.log(JSON.stringify(testData, null, 2));
  }
}

runMigration().catch(console.error);
