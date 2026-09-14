import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Controleert of er ritten zijn waarvan de check-in is verstreken.
 *
 * Twee stappen:
 *   1. `process_overdue_trips` zet in de database waarschuwingen klaar voor
 *      elk contact bij een rit die te laat is.
 *   2. Deze functie verstuurt die waarschuwingen en markeert ze als verzonden.
 *
 * De detectie zit bewust in de database. Zo blijft hij correct als er meerdere
 * instanties tegelijk draaien, en wordt niemand dubbel gealarmeerd.
 *
 * Inplannen: elke minuut, via pg_cron met pg_net of een externe cron.
 * Beveiliging: vereist de service-role key, of een geheim in CRON_SECRET.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Hoeveel minuten speling voordat er gealarmeerd wordt. */
const GRACE_MINUTES = 5;

interface PendingAlert {
  id: string;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Alleen de planner mag dit aanroepen, niet zomaar een bezoeker.
  const expected = Deno.env.get("CRON_SECRET");
  if (expected && request.headers.get("x-cron-secret") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    return json({ error: "SUPABASE_SERVICE_ROLE_KEY ontbreekt" }, 503);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Detecteer te late ritten en maak de waarschuwingen aan.
    const { data: created, error: processError } = await supabase.rpc("process_overdue_trips", {
      grace_minutes: GRACE_MINUTES,
    });
    if (processError) throw processError;

    // 2. Verstuur wat klaarstaat.
    const { data: pending, error: fetchError } = await supabase
      .from("trip_alerts")
      .select("id, contact_name, contact_phone, contact_email, last_lat, last_lng, last_location_at")
      .eq("status", "pending")
      .limit(100);
    if (fetchError) throw fetchError;

    let sent = 0;
    let failed = 0;

    for (const alert of (pending ?? []) as PendingAlert[]) {
      try {
        await deliver(alert);
        await supabase
          .from("trip_alerts")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", alert.id);
        sent++;
      } catch (error) {
        await supabase
          .from("trip_alerts")
          .update({
            status: "failed",
            error: error instanceof Error ? error.message : "onbekende fout",
          })
          .eq("id", alert.id);
        failed++;
      }
    }

    return json({ alertsCreated: created ?? 0, sent, failed });
  } catch (error) {
    console.error("check-overdue-trips failed:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

/**
 * Verstuurt één waarschuwing.
 *
 * Er is nog geen mail- of sms-provider gekoppeld, dus dit logt het bericht en
 * slaagt. Vervang de body van deze functie door een aanroep naar je provider
 * (Resend, Twilio, MessageBird) zodra je die hebt; de rest van de keten werkt
 * dan zonder verdere wijzigingen.
 */
async function deliver(alert: PendingAlert): Promise<void> {
  const where =
    alert.last_lat !== null && alert.last_lng !== null
      ? `https://www.google.com/maps?q=${alert.last_lat},${alert.last_lng}`
      : "geen locatie bekend";

  const message =
    `SafeBuddy: een rit is niet op tijd afgemeld.\n` +
    `Laatst bekende locatie: ${where}\n` +
    `Tijdstip: ${alert.last_location_at ?? "onbekend"}`;

  console.log(`[alert] naar ${alert.contact_name} (${alert.contact_phone ?? alert.contact_email ?? "geen contactgegevens"}):\n${message}`);

  // Voorbeeld met een mailprovider:
  //
  //   const key = Deno.env.get("RESEND_API_KEY");
  //   if (key && alert.contact_email) {
  //     const response = await fetch("https://api.resend.com/emails", {
  //       method: "POST",
  //       headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  //       body: JSON.stringify({
  //         from: "SafeBuddy <alerts@jouwdomein.nl>",
  //         to: alert.contact_email,
  //         subject: "SafeBuddy: rit niet afgemeld",
  //         text: message,
  //       }),
  //     });
  //     if (!response.ok) throw new Error(`Resend gaf ${response.status}`);
  //   }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
