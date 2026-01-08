const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");

const supabaseUrl = "https://irrinahkpkuaqcrlovph.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycmluYWhrcGt1YXFjcmxvdnBoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTcyNDc1NSwiZXhwIjoyMDUxMzAwNzU1fQ.oX3bd2-ad78-e4ec5c8ffa99_V-5LtcJ-0iNaNwgOkiZs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeSql() {
  console.log("📝 Reading SQL file...");
  const sql = fs.readFileSync("add-coords-function.sql", "utf8");
  
  console.log("🔧 Executing SQL...");
  
  // Execute via Supabase API
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql })
  });
  
  if (!response.ok) {
    console.error("❌ Failed to execute SQL");
    console.error(await response.text());
  } else {
    console.log("✅ SQL executed successfully!");
  }
}

executeSql();
