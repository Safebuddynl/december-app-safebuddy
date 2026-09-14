import { supabase } from "@/integrations/supabase/client";
import type { LatLng } from "@/lib/geo";

/**
 * Ritten delen met vertrouwde contacten.
 *
 * De eigenaar praat gewoon met de tabel; row level security zorgt dat dat
 * alleen zijn eigen ritten zijn. De kijker met een deellink is niet ingelogd
 * en gaat via `get_shared_trip`, dat alleen antwoordt bij een geldig token van
 * een lopende rit.
 */

export type TripStatus = "active" | "completed" | "cancelled" | "expired";

export interface TrustedContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface TripShare {
  id: string;
  shareToken: string;
  status: TripStatus;
  destinationAddress: string | null;
  expectedArrival: string | null;
  startedAt: string;
}

/** Wat een kijker met de deellink te zien krijgt. */
export interface SharedTripView {
  status: TripStatus;
  destinationAddress: string | null;
  destination: LatLng | null;
  lastLocation: LatLng | null;
  lastLocationAt: string | null;
  startedAt: string;
  expectedArrival: string | null;
  ownerName: string | null;
}

// -- Contacten ---------------------------------------------------------------

export async function listContacts(): Promise<TrustedContact[]> {
  const { data, error } = await supabase
    .from("trusted_contacts")
    .select("id, contact_name, contact_phone, contact_email")
    .order("contact_name");

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.contact_name,
    phone: row.contact_phone,
    email: row.contact_email,
  }));
}

export async function addContact(input: {
  name: string;
  phone?: string;
  email?: string;
}): Promise<TrustedContact> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("not-authenticated");

  const { data, error } = await supabase
    .from("trusted_contacts")
    .insert({
      user_id: user.id,
      contact_name: input.name.trim(),
      contact_phone: input.phone?.trim() || null,
      contact_email: input.email?.trim() || null,
    })
    .select("id, contact_name, contact_phone, contact_email")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.contact_name,
    phone: data.contact_phone,
    email: data.contact_email,
  };
}

/** Row level security only lets the owner change their own contacts. */
export async function updateContact(
  id: string,
  input: { name: string; phone?: string; email?: string }
): Promise<TrustedContact> {
  const { data, error } = await supabase
    .from("trusted_contacts")
    .update({
      contact_name: input.name.trim(),
      contact_phone: input.phone?.trim() || null,
      contact_email: input.email?.trim() || null,
    })
    .eq("id", id)
    .select("id, contact_name, contact_phone, contact_email")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.contact_name,
    phone: data.contact_phone,
    email: data.contact_email,
  };
}

export async function removeContact(id: string): Promise<void> {
  const { error } = await supabase.from("trusted_contacts").delete().eq("id", id);
  if (error) throw error;
}

// -- Ritten ------------------------------------------------------------------

export interface StartTripInput {
  destinationAddress?: string;
  destination?: LatLng;
  /** Wanneer de gebruiker verwacht aan te komen. Gebruikt door de check-in. */
  expectedArrival?: Date;
  /** Welke contacten deze rit mogen volgen. */
  contactIds?: string[];
}

export async function startTrip(input: StartTripInput = {}): Promise<TripShare> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("not-authenticated");

  const { data, error } = await supabase
    .from("trip_shares")
    .insert({
      user_id: user.id,
      share_token: generateShareToken(),
      status: "active",
      destination_address: input.destinationAddress ?? null,
      destination: input.destination
        ? `SRID=4326;POINT(${input.destination.lng} ${input.destination.lat})`
        : null,
      expected_arrival: input.expectedArrival?.toISOString() ?? null,
    })
    .select("id, share_token, status, destination_address, expected_arrival, started_at")
    .single();

  if (error) throw error;

  if (input.contactIds?.length) {
    const { error: linkError } = await supabase.from("trip_share_recipients").insert(
      input.contactIds.map((contactId) => ({ trip_share_id: data.id, contact_id: contactId }))
    );
    // De rit is al aangemaakt; wie meekijkt is secundair.
    if (linkError) console.error("[SafeBuddy] Contacten koppelen mislukt:", linkError.message);
  }

  return toTripShare(data);
}

/** Geef de huidige positie door aan de lopende rit. */
export async function pushLocation(tripId: string, point: LatLng): Promise<void> {
  const { error } = await supabase.rpc("push_trip_location", {
    trip_id: tripId,
    lat: point.lat,
    lng: point.lng,
  });
  if (error) throw error;
}

/**
 * Meld je veilig af. De rit sluit en de contacten worden niet gewaarschuwd.
 */
export async function checkIn(tripId: string): Promise<void> {
  const { error } = await supabase.rpc("check_in_trip", { trip_id: tripId });
  if (error) throw error;
}

/** Verleng de check-in als het langer duurt. Geeft de nieuwe tijd terug. */
export async function extendTrip(tripId: string, extraMinutes: number): Promise<string> {
  const { data, error } = await supabase.rpc("extend_trip", {
    trip_id: tripId,
    extra_minutes: extraMinutes,
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Beëindig het delen. De deellink werkt daarna niet meer. */
export async function endTrip(
  tripId: string,
  status: Extract<TripStatus, "completed" | "cancelled"> = "completed"
): Promise<void> {
  const { error } = await supabase
    .from("trip_shares")
    .update({ status, ended_at: new Date().toISOString() })
    .eq("id", tripId);

  if (error) throw error;
}

/** De rit die nog loopt, als die er is. Handig na het herladen van de pagina. */
export async function findActiveTrip(): Promise<TripShare | null> {
  const { data, error } = await supabase
    .from("trip_shares")
    .select("id, share_token, status, destination_address, expected_arrival, started_at")
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? toTripShare(data) : null;
}

// -- Kijker met de deellink --------------------------------------------------

/** Haal de stand van een gedeelde rit op. Null bij een ongeldig token. */
export async function fetchSharedTrip(token: string): Promise<SharedTripView | null> {
  const { data, error } = await supabase.rpc("get_shared_trip", { token });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    status: row.status as TripStatus,
    destinationAddress: row.destination_address,
    destination: pointOrNull(row.dest_lat, row.dest_lng),
    lastLocation: pointOrNull(row.last_lat, row.last_lng),
    lastLocationAt: row.last_location_at,
    startedAt: row.started_at,
    expectedArrival: row.expected_arrival,
    ownerName: row.owner_name,
  };
}

/** Het afgelegde spoor, nieuwste eerst. */
export async function fetchSharedTripTrack(token: string): Promise<LatLng[]> {
  const { data, error } = await supabase.rpc("get_shared_trip_track", {
    token,
    max_points: 200,
  });
  if (error) throw error;

  return ((data ?? []) as { lat: number; lng: number }[])
    .map((row) => ({ lat: row.lat, lng: row.lng }))
    .reverse();
}

/** De link die je aan een contact stuurt. */
export function shareUrlFor(token: string): string {
  return `${window.location.origin}/trip/${token}`;
}

// -- Intern ------------------------------------------------------------------

interface TripRow {
  id: string;
  share_token: string;
  status: string;
  destination_address: string | null;
  expected_arrival: string | null;
  started_at: string;
}

const toTripShare = (row: TripRow): TripShare => ({
  id: row.id,
  shareToken: row.share_token,
  status: row.status as TripStatus,
  destinationAddress: row.destination_address,
  expectedArrival: row.expected_arrival,
  startedAt: row.started_at,
});

const pointOrNull = (lat: unknown, lng: unknown): LatLng | null =>
  typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;

/**
 * 32 willekeurige bytes als base64url.
 *
 * Dit is het enige dat een deellink beschermt, dus het komt uit de
 * cryptografische generator van de browser, niet uit Math.random.
 */
function generateShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
