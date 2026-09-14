import type { TravelMode } from "@/lib/routing/directions";
import type { RouteSafety } from "@/lib/routing/safety";

/**
 * Explaining a route's score in plain language.
 *
 * This is written entirely from the computed factors, with no language model
 * and no network call. The score is decided by `routing/safety.ts`; this only
 * phrases what is already there, so the explanation can never disagree with
 * the number it is explaining.
 */

export interface ExplanationInput {
  safety: RouteSafety;
  distanceLabel: string;
  durationLabel: string;
  travelMode: TravelMode;
}

const MODE_LABEL: Record<TravelMode, string> = {
  foot: "lopen",
  bike: "fietsen",
  car: "rijden",
};

/**
 * Two to four sentences on why the route scored what it did, ending with
 * something the traveller can act on.
 */
export function explainRoute({
  safety,
  distanceLabel,
  durationLabel,
  travelMode,
}: ExplanationInput): string {
  const sentences: string[] = [];

  const verdict =
    safety.score >= 90
      ? "Deze route komt langs weinig of geen gemelde plekken"
      : safety.score >= 70
        ? "Deze route is redelijk, met een paar aandachtspunten"
        : "Deze route komt langs meerdere gemelde plekken";

  sentences.push(
    `${verdict}: ${safety.score} van 100, ${distanceLabel} ${MODE_LABEL[travelMode]} ` +
      `in ${durationLabel}, beoordeeld ${safety.time.label}.`
  );

  const [main] = safety.factors;
  if (main) sentences.push(`Wat het zwaarst meetelt: ${main.detail}.`);

  if (safety.exposure.density !== null && safety.exposure.municipality) {
    sentences.push(
      `De meldingen zijn gecorrigeerd voor de bevolkingsdichtheid van ${safety.exposure.municipality} ` +
        `(${safety.exposure.density} inwoners per km²), zodat drukke en rustige gebieden eerlijk vergelijken.`
    );
  }

  if (safety.lighting && safety.time.isDark) {
    const lit = Math.round(safety.lighting.coverage * 100);
    sentences.push(
      lit >= 80
        ? `Vrijwel de hele route is verlicht volgens OpenStreetMap (${lit}%).`
        : `Slechts ${lit}% van de route heeft straatverlichting in OpenStreetMap.`
    );
  }

  sentences.push(
    safety.score >= 70
      ? "Blijf alert en houd je telefoon bereikbaar."
      : "Overweeg een andere route, een ander tijdstip, of ga samen."
  );

  return sentences.join(" ");
}
