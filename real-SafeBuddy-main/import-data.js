import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://irrinahkpkuaqcrlovph.supabase.co',
  'sb_publishable_d2T0MP9vEoQHZWPZq2Vv4A_HQ5XP5Yp'
);

// Parse CSV en converteer naar map_points format
function parseCSV(csvContent) {
  const lines = csvContent.split('\n');
  const headers = lines[0].split(';').map(h => h.replace(/"/g, ''));
  
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = lines[i].split(';').map(v => v.replace(/"/g, ''));
    const row = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    
    // Convert naar map_point format
    if (row.latitude && row.longitude) {
      // Parse lat/lon (vervang komma met punt voor decimalen)
      const lat = parseFloat(row.latitude.replace(',', '.'));
      const lon = parseFloat(row.longitude.replace(',', '.'));
      
      // Bepaal severity gebaseerd op waarom ze zich onveilig voelen
      let severity = 'medium';
      const reasons = row.waardoor_voel_jij_je_hier_onveilig || '';
      if (reasons.includes('Mij')) severity = 'high';
      
      // Bepaal report type gebaseerd op tijd van dag
      let reportType = 'unsafe_area';
      const timeOfDay = row.op_welk_deel_van_de_dag_voel_jij_je_hier_vooral_onveilig || '';
      if (timeOfDay.includes('Donker')) {
        reportType = 'poor_lighting';
      }
      
      // Maak titel
      const title = `Onveilig gevoel in ${row.gemeente || 'onbekende locatie'}`;
      
      // Maak beschrijving
      const description = [
        reasons && `Reden: ${reasons}`,
        timeOfDay && `Tijdstip: ${timeOfDay}`,
        row.pas_je_je_gedrag_hierdoor_aan && `Gedragsaanpassing: ${row.pas_je_je_gedrag_hierdoor_aan}`
      ].filter(Boolean).join('. ');
      
      data.push({
        title,
        description,
        report_type: reportType,
        severity,
        latitude: lat,
        longitude: lon,
        gemeente: row.gemeente,
        datum: row.datum_ingevuld
      });
    }
  }
  
  return data;
}

async function importData() {
  console.log('📂 Reading CSV file...');
  
  const csvPath = 'c:\\Users\\rspei\\AppData\\Local\\Temp\\dc532fd7-969d-4ce5-9bcb-ce89698f847d_onveilige_plekken_data_Pointer_20250916_v2.zip.47d\\20250916_0932_onveilige_plekken_pointer_openbaar.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  console.log('🔄 Parsing CSV data...');
  const data = parseCSV(csvContent);
  
  console.log(`✅ Parsed ${data.length} records\n`);
  console.log('📤 Uploading to Supabase in batches...\n');
  
  // Upload in batches van 100 (Supabase limiet)
  const batchSize = 100;
  let uploaded = 0;
  let errors = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    
    // Convert to map_points format met PostGIS POINT
    const mapPoints = batch.map(item => ({
      owner_id: null, // Geen specifieke eigenaar voor bulk import
      title: item.title,
      description: item.description,
      report_type: item.report_type,
      severity: item.severity,
      location: `POINT(${item.longitude} ${item.latitude})`,
      upvotes: 0,
      is_verified: true // Markeer als geverifieerd omdat het officiële data is
    }));
    
    const { data: inserted, error } = await supabase
      .from('map_points')
      .insert(mapPoints)
      .select();
    
    if (error) {
      console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, error.message);
      errors += batch.length;
    } else {
      uploaded += inserted.length;
      console.log(`✅ Uploaded batch ${Math.floor(i / batchSize) + 1}: ${inserted.length} records (Total: ${uploaded}/${data.length})`);
    }
    
    // Kleine pauze om rate limiting te voorkomen
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n🎉 Import complete!`);
  console.log(`   ✅ Successfully uploaded: ${uploaded}`);
  if (errors > 0) {
    console.log(`   ❌ Failed: ${errors}`);
  }
}

importData().catch(console.error);
