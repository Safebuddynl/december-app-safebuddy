import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { decodeWkbPoint, isValidLatLng, parseCoordinate } from "@/lib/geo";
import { KRO_TABLE, classifyBasis, normaliseSeverity, type SafetyReport } from "./types";

/**
 * Loads the two report sources the app shows on the map and in the feed.
 *
 * Route and Community both need exactly this list, so it lives here rather
 * than being copy-pasted into each page.
 */

/**
 * PostgREST caps every response at 1000 rows, whatever `limit` asks for.
 * That cap is a server setting the client cannot raise, so the only way to
 * read the whole table is to request successive ranges.
 */
const PAGE_SIZE = 1000;

/**
 * How many range requests to keep in flight at once. The dataset is about
 * 15 pages, so a handful at a time finishes quickly without opening fifteen
 * simultaneous connections.
 */
const PAGE_CONCURRENCY = 5;

/** Safety valve so a runaway table cannot spin forever. */
const MAX_PAGES = 100;

export async function fetchAllReports(): Promise<SafetyReport[]> {
  // Fetch both sources at once; a failure in one must not hide the other.
  const [userReports, historicReports] = await Promise.all([
    fetchUserReports(),
    fetchHistoricReports(),
  ]);

  return [...userReports, ...historicReports].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Community-submitted reports from the `safety_reports` table.
 *
 * Paged for the same reason as the historic table: one request tops out at
 * 1000 rows. There are only a handful today, so this normally costs a single
 * request, but it will not silently start dropping reports as the table grows.
 */
async function fetchUserReports(): Promise<SafetyReport[]> {
  const rows: Record<string, unknown>[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;

    const { data, error } = await supabase
      .from("safety_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error("[SafeBuddy] Could not load safety_reports:", error.message);
      break;
    }

    rows.push(...((data ?? []) as Record<string, unknown>[]));

    // A short page means this was the last one.
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows.map((row) => ({
    id: String(row.id),
    source: "safety_reports" as const,
    reportType: String(row.report_type ?? "Melding"),
    locationAddress: String(row.location_address ?? "Onbekende locatie"),
    severity: normaliseSeverity(row.severity),
    description: String(row.description ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    upvotes: Number(row.upvotes ?? 0),
    userId: row.user_id ? String(row.user_id) : null,
    // `safety_reports` has no latitude/longitude columns. The position is in
    // the PostGIS `location` column, which PostgREST returns as hex EWKB.
    coordinates: decodeWkbPoint(row.location),
    // The table records no municipality, so density correction falls back to
    // neutral for user reports. See resolveMunicipality in lib/safety.
    municipality: null,
    timeOfDay: row.time_of_day ? String(row.time_of_day) : null,
    // A user bothered to file this, so treat it as a reported incident.
    basis: "incident" as const,
  }));
}

/**
 * The imported historic dataset, fetched in full.
 *
 * It is queried over plain REST rather than through the Supabase client
 * because the table is not part of the generated `Database` types.
 *
 * The whole table is read one page at a time. A single request only ever
 * returns 1000 rows, so asking once left roughly 14.000 reports off the map.
 */
async function fetchHistoricReports(): Promise<SafetyReport[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  try {
    // The first page also reports the total, which tells us how many more
    // pages to ask for without guessing.
    const first = await fetchPage(0, true);
    if (!first) return [];

    const pageCount = Math.min(Math.ceil(first.total / PAGE_SIZE), MAX_PAGES);
    const remaining = Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 1);

    const rows = [...first.rows];
    for (let i = 0; i < remaining.length; i += PAGE_CONCURRENCY) {
      const batch = remaining.slice(i, i + PAGE_CONCURRENCY);
      const results = await Promise.all(batch.map((page) => fetchPage(page, false)));
      for (const result of results) {
        if (result) rows.push(...result.rows);
      }
    }

    if (rows.length < first.total) {
      console.warn(
        `[SafeBuddy] Loaded ${rows.length} of ${first.total} rows from ${KRO_TABLE}; ` +
          "some pages failed."
      );
    }

    return rows.map(toHistoricReport).filter((report): report is SafetyReport => report !== null);
  } catch (error) {
    console.error(`[SafeBuddy] Could not load ${KRO_TABLE}:`, error);
    return [];
  }
}

interface HistoricPage {
  rows: Record<string, unknown>[];
  /** Total rows in the table, from the Content-Range header. */
  total: number;
}

/**
 * One page of the historic table.
 *
 * Rows are ordered by primary key so the pages line up: without an explicit
 * order the database may return rows in any order and paging could repeat or
 * skip records.
 */
async function fetchPage(page: number, withCount: boolean): Promise<HistoricPage | null> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Range-Unit": "items",
    Range: `${from}-${to}`,
  };
  if (withCount) headers.Prefer = "count=exact";

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${KRO_TABLE}?select=*&order=id.asc`, {
    headers,
  });

  // 206 Partial Content is the normal answer to a ranged request; 200 comes
  // back when the range covers the whole table.
  if (!response.ok && response.status !== 206) {
    console.error(
      `[SafeBuddy] Could not load ${KRO_TABLE} rows ${from}-${to} (${response.status}). ` +
        "Check that the table allows anonymous SELECT."
    );
    return null;
  }

  const rows: Record<string, unknown>[] = await response.json();
  return { rows, total: parseTotal(response.headers.get("content-range"), rows.length) };
}

/** Read the row count out of a `Content-Range: 0-999/14903` header. */
function parseTotal(contentRange: string | null, fallback: number): number {
  const total = Number(contentRange?.split("/")[1]);
  return Number.isFinite(total) ? total : fallback;
}

/**
 * Map one KRO row onto the shared report shape.
 *
 * Column names here are the live schema's, which differ from what earlier
 * versions of this code assumed: it is `locatie_id` (not `locale_id`) and
 * `Gedragsaanpassing` (not `Gedrgsaanpassing`).
 */
function toHistoricReport(row: Record<string, unknown>): SafetyReport | null {
  const lat = parseCoordinate(row.latitude);
  const lng = parseCoordinate(row.longitude);
  const hasPosition = lat !== null && lng !== null && isValidLatLng(lat, lng);

  const id = row.locatie_id ?? row.id;
  if (id === null || id === undefined) return null;

  const municipality = typeof row.gemeente === "string" ? row.gemeente.trim() : "";
  const reason = typeof row.Reden === "string" ? row.Reden.trim() : "";

  return {
    id: `kro:${id}`,
    source: "kro",
    reportType: reason || "Melding",
    locationAddress: municipality || reason || "Geverifieerde melding",
    severity: normaliseSeverity(row.severity),
    description: typeof row.Gedragsaanpassing === "string" ? row.Gedragsaanpassing : "",
    createdAt: String(row.datum ?? new Date().toISOString()),
    // The historic table has no upvotes column, so it is always zero.
    upvotes: 0,
    userId: null,
    coordinates: hasPosition ? { lat: lat as number, lng: lng as number } : null,
    municipality: municipality || null,
    // "Vooral als het donker is", "Op verschillende momenten van de dag", etc.
    timeOfDay: typeof row.Tijdstip === "string" ? row.Tijdstip : null,
    basis: classifyBasis(row.Reden),
  };
}
