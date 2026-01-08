// Quick check: welke tabellen bestaan er al in de database?
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://irrinahkpkuaqcrlovph.supabase.co',
  'sb_publishable_d2T0MP9vEoQHZWPZq2Vv4A_HQ5XP5Yp'
);

async function checkDatabase() {
  console.log('🔍 Checking database...\n');
  console.log('Using URL:', 'https://irrinahkpkuaqcrlovph.supabase.co');
  console.log('Using Key:', 'sb_publishable_d2T0MP9vEoQHZWPZq2Vv4A_HQ5XP5Yp'.substring(0, 20) + '...\n');

  // Check profiles table
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);
  
  if (profilesError) {
    console.log('✓ profiles table: ❌ NIET GEVONDEN');
    console.log('  Error:', profilesError.message);
  } else {
    console.log('✓ profiles table: ✅ EXISTS');
  }

  // Check safety_reports table
  const { data: reports, error: reportsError } = await supabase
    .from('safety_reports')
    .select('id')
    .limit(1);
  
  if (reportsError) {
    console.log('✓ safety_reports table: ❌ NIET GEVONDEN');
    console.log('  Error:', reportsError.message);
  } else {
    console.log('✓ safety_reports table: ✅ EXISTS');
  }

  // Check map_points table (nieuwe tabel)
  const { data: mapPoints, error: mapPointsError } = await supabase
    .from('map_points')
    .select('id')
    .limit(1);
  
  if (mapPointsError) {
    console.log('✓ map_points table: ❌ NIET GEVONDEN');
    console.log('  Error:', mapPointsError.message);
  } else {
    console.log('✓ map_points table: ✅ EXISTS');
  }

  // Check if location column exists in safety_reports
  const { data: reportsWithLocation, error: locationError } = await supabase
    .from('safety_reports')
    .select('location')
    .limit(1);
  
  if (locationError) {
    console.log('✓ location column in safety_reports: ❌ NIET GEVONDEN');
    console.log('  Error:', locationError.message);
  } else {
    console.log('✓ location column in safety_reports: ✅ EXISTS');
  }

  console.log('\n📋 Samenvatting:');
  if (mapPointsError) {
    console.log('   → Database tabellen bestaan niet of je hebt geen toegang');
    console.log('   → Check of je de SQL hebt uitgevoerd in het juiste Supabase project');
  } else {
    console.log('   → ✅ Alles is klaar! PostGIS werkt.');
  }
}

checkDatabase().catch(console.error);
