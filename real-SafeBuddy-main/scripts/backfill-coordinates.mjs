/**
 * Eenmalige backfill: geocodeer meldingen die alleen een tekstadres hebben.
 *
 * Vroeger deed de safe-route edge function dit bij elke aanvraag opnieuw, voor
 * elke melding. Dit script doet het één keer en schrijft het resultaat weg.
 *
 * Draaien:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-coordinates.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-coordinates.mjs --apply
 *
 * Zonder --apply laat het alleen zien wat het zou doen.
 *
 * De service-role key komt uit de omgeving en staat nooit in dit bestand:
 * schrijven vereist rechten die de anonieme key niet heeft.
 */
import fs from "fs";

const APPLY = process.argv.includes("--apply");

/** Nominatim staat maximaal 1 verzoek per seconde toe. */
const RATE_LIMIT_MS = 1100;

const env = readEnvFile(".env");
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("VITE_SUPABASE_URL ontbreekt. Zet hem in .env of in de omgeving.");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error(
    "SUPABASE_SERVICE_ROLE_KEY ontbreekt.\n" +
      "Haal hem uit het Supabase-dashboard en geef hem mee als omgevingsvariabele.\n" +
      "Zet hem nooit in een bestand dat in git staat."
  );
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const rows = await fetchRowsMissingCoordinates();
console.log(`${rows.length} melding(en) zonder coördinaten.`);

if (rows.length === 0) {
  console.log("Niets te doen.");
  process.exit(0);
}
if (!APPLY) {
  console.log("\nDroogloop. Draai opnieuw met --apply om weg te schrijven.\n");
}

let filled = 0;
let failed = 0;

for (const [index, row] of rows.entries()) {
  const point = await geocode(row.location_address);

  if (!point) {
    console.log(`  ${index + 1}/${rows.length}  MISLUKT   ${row.location_address}`);
    failed++;
  } else {
    console.log(
      `  ${index + 1}/${rows.length}  ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}  ${row.location_address}`
    );
    if (APPLY) await writeLocation(row.id, point);
    filled++;
  }

  // Ook bij een misser wachten: de rate limit geldt per verzoek.
  if (index < rows.length - 1) await sleep(RATE_LIMIT_MS);
}

console.log(`\nGevonden: ${filled}   Niet herkend: ${failed}`);
if (!APPLY && filled > 0) console.log("Er is niets weggeschreven (droogloop).");

async function fetchRowsMissingCoordinates() {
  const url =
    `${SUPABASE_URL}/rest/v1/safety_reports` +
    "?select=id,location_address&location=is.null&location_address=not.is.null";

  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.error(`Ophalen mislukt: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  return response.json();
}

/** Zet een adres om naar coördinaten via Nominatim. */
async function geocode(address) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${address}, Nederland`);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      // Nominatim weigert verzoeken zonder herkenbare User-Agent.
      headers: { "User-Agent": "SafeBuddy backfill (eenmalig, contact: team@safebuddy.example)" },
    });
    if (!response.ok) return null;

    const [hit] = await response.json();
    if (!hit) return null;

    const lat = Number.parseFloat(hit.lat);
    const lng = Number.parseFloat(hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/** PostGIS verwacht POINT(longitude latitude). */
async function writeLocation(id, { lat, lng }) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/safety_reports?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ location: `SRID=4326;POINT(${lng} ${lat})` }),
  });

  if (!response.ok) {
    console.error(`    wegschrijven mislukt voor ${id}: ${response.status} ${await response.text()}`);
  }
}

function readEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
