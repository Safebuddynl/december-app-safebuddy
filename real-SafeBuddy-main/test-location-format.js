import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://irrinahkpkuaqcrlovph.supabase.co";
const supabaseAnonKey = "sb_publishable_d2T0MP9vEoQHZWPZq2Vv4A_HQ5XP5Yp";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testQuery() {
  console.log("📡 Testing map_points query...\n");
  
  // Test 1: Basic query
  const { data, error } = await supabase
    .from("map_points")
    .select("id, title, location")
    .limit(3);
  
  if (error) {
    console.error("❌ Error:", error);
    return;
  }
  
  console.log("Raw data from Supabase:");
  console.log(JSON.stringify(data, null, 2));
  
  console.log("\n📍 Analyzing location field types:");
  data.forEach((item, i) => {
    console.log(`\nItem ${i + 1}:`);
    console.log(`  id: ${item.id}`);
    console.log(`  title: ${item.title}`);
    console.log(`  location type: ${typeof item.location}`);
    console.log(`  location value: ${JSON.stringify(item.location)}`);
    
    if (item.location) {
      if (typeof item.location === 'string') {
        console.log(`  → String format detected`);
        const match = item.location.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
        if (match) {
          console.log(`  → Extracted: lng=${match[1]}, lat=${match[2]}`);
        }
      } else if (typeof item.location === 'object') {
        console.log(`  → Object format detected`);
        console.log(`  → Keys: ${Object.keys(item.location).join(', ')}`);
      }
    }
  });
}

testQuery();
