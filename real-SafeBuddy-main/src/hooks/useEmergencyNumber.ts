import { useEffect, useState } from "react";
import { reverseGeocodeDetailed } from "@/lib/geocoding";
import {
  FALLBACK_EMERGENCY,
  emergencyNumberFor,
  isKnownCountry,
  type EmergencyNumber,
} from "@/lib/emergencyNumbers";
import type { LatLng } from "@/lib/geo";

/**
 * Bepaalt welk noodnummer hier geldt.
 *
 * Het land wordt afgeleid uit de huidige positie. Zolang dat niet bekend is,
 * of als het opzoeken mislukt, staat er 112. De knop is dus altijd bruikbaar,
 * ook zonder netwerk.
 */
export interface UseEmergencyNumberResult {
  emergency: EmergencyNumber;
  /** True zolang het land nog wordt opgezocht. */
  isResolving: boolean;
  /** False als we terugvallen op 112 zonder het land te kennen. */
  isConfirmed: boolean;
}

/** Zoek het land niet opnieuw op voor kleine verplaatsingen. */
const REFRESH_DISTANCE_DEGREES = 0.1;

export function useEmergencyNumber(position: LatLng | null): UseEmergencyNumberResult {
  const [emergency, setEmergency] = useState<EmergencyNumber>(FALLBACK_EMERGENCY);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedAt, setResolvedAt] = useState<LatLng | null>(null);

  useEffect(() => {
    if (!position) return;

    // Een landgrens ligt nooit binnen een paar honderd meter van de vorige
    // meting, dus opnieuw opzoeken is meestal verspilde moeite.
    if (
      resolvedAt &&
      Math.abs(resolvedAt.lat - position.lat) < REFRESH_DISTANCE_DEGREES &&
      Math.abs(resolvedAt.lng - position.lng) < REFRESH_DISTANCE_DEGREES
    ) {
      return;
    }

    let active = true;
    setIsResolving(true);

    reverseGeocodeDetailed(position)
      .then((result) => {
        if (!active) return;
        setCountryCode(result.countryCode);
        setEmergency(emergencyNumberFor(result.countryCode));
        setResolvedAt(position);
      })
      .finally(() => {
        if (active) setIsResolving(false);
      });

    return () => {
      active = false;
    };
  }, [position, resolvedAt]);

  return { emergency, isResolving, isConfirmed: isKnownCountry(countryCode) };
}
