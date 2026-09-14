/**
 * Regenerates src/data/municipalityDensity.ts from CBS open data.
 *
 * Run it when CBS publishes a new "Kerncijfers wijken en buurten" table:
 *   node scripts/update-density-data.mjs
 *
 * The data is bundled rather than fetched at runtime because it is small
 * (a few kilobytes), changes once a year, and route scoring must not depend
 * on a third-party API being reachable.
 */
import fs from "fs";
import path from "path";

/** CBS table "Kerncijfers wijken en buurten". Bump this for a newer year. */
const CBS_TABLE = "85984NED";
const CBS_YEAR = 2024;

const url =
  `https://opendata.cbs.nl/ODataApi/odata/${CBS_TABLE}/TypedDataSet` +
  "?$filter=startswith(WijkenEnBuurten,'GM')" +
  "&$select=Gemeentenaam_1,AantalInwoners_5,Bevolkingsdichtheid_34," +
  "MateVanStedelijkheid_120,Omgevingsadressendichtheid_121";

console.log(`Fetching ${CBS_TABLE} from CBS...`);
const response = await fetch(url);
if (!response.ok) {
  console.error(`CBS returned ${response.status}`);
  process.exit(1);
}

const { value: rows } = await response.json();
console.log(`Received ${rows.length} municipalities.`);

const entries = [];
for (const row of rows) {
  const name = String(row.Gemeentenaam_1 ?? "").trim();
  const density = row.Bevolkingsdichtheid_34;
  if (!name || typeof density !== "number" || density <= 0) continue;

  entries.push({
    name,
    density,
    // 1 = very urban, 5 = rural. Used as a coarse fallback.
    urbanity: typeof row.MateVanStedelijkheid_120 === "number" ? row.MateVanStedelijkheid_120 : 3,
    inhabitants: typeof row.AantalInwoners_5 === "number" ? row.AantalInwoners_5 : 0,
  });
}

entries.sort((a, b) => a.name.localeCompare(b.name, "nl"));

const densities = entries.map((e) => e.density).sort((a, b) => a - b);
const median = densities[Math.floor(densities.length / 2)];

const header = `// GENERATED FILE - do not edit by hand.
// Source: CBS "Kerncijfers wijken en buurten ${CBS_YEAR}" (table ${CBS_TABLE}),
// retrieved ${new Date().toISOString().slice(0, 10)}.
// Regenerate with: node scripts/update-density-data.mjs
//
// Population density in inhabitants per km2, per Dutch municipality.
// Used to correct report counts for how many people are actually around.

export interface MunicipalityStats {
  /** Inhabitants per square kilometre. */
  density: number;
  /** CBS urbanity class: 1 = very urban, 5 = rural. */
  urbanity: number;
}

/** The national median density, used as the neutral reference point. */
export const MEDIAN_DENSITY = ${median};

/** Keyed by municipality name exactly as CBS and the report data spell it. */
export const MUNICIPALITY_STATS: Record<string, MunicipalityStats> = {
`;

const body = entries
  .map((e) => `  ${JSON.stringify(e.name)}: { density: ${e.density}, urbanity: ${e.urbanity} },`)
  .join("\n");

const out = `${header}${body}\n};\n`;

const target = path.join("src", "data", "municipalityDensity.ts");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out, "utf8");

console.log(`Wrote ${entries.length} municipalities to ${target}`);
console.log(`Median density: ${median}/km2`);
console.log(`Size: ${(out.length / 1024).toFixed(1)} kB`);
