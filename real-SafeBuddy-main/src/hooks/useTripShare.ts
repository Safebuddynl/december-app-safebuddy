import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";
import {
  checkIn,
  endTrip,
  extendTrip,
  findActiveTrip,
  pushLocation,
  startTrip,
  type StartTripInput,
  type TripShare,
} from "@/lib/trips";

/**
 * Het delen van een lopende rit.
 *
 * Houdt de actieve rit bij, stuurt de positie door zolang er gedeeld wordt, en
 * ruimt netjes op bij stoppen of bij het verlaten van de pagina.
 */

/** Hoe vaak de positie naar de server gaat. */
const PUSH_INTERVAL_MS = 15_000;

export interface UseTripShareResult {
  trip: TripShare | null;
  isSharing: boolean;
  isBusy: boolean;
  start: (input?: StartTripInput) => Promise<TripShare | null>;
  stop: () => Promise<void>;
  /** Veilig afgemeld: sluit de rit en annuleert de waarschuwing. */
  checkIn: () => Promise<void>;
  /** Schuif de verwachte aankomst op. */
  extend: (extraMinutes: number) => Promise<void>;
}

export function useTripShare(position: LatLng | null): UseTripShareResult {
  const [trip, setTrip] = useState<TripShare | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // De laatst doorgegeven positie en het moment daarvan, zodat we niet vaker
  // schrijven dan nodig.
  const lastPushRef = useRef(0);
  const positionRef = useRef<LatLng | null>(null);
  positionRef.current = position;

  // Een rit die nog liep bij het herladen van de pagina weer oppakken.
  useEffect(() => {
    let active = true;

    findActiveTrip()
      .then((found) => active && setTrip(found))
      .catch((error) => console.error("[SafeBuddy] Actieve rit ophalen mislukt:", error));

    return () => {
      active = false;
    };
  }, []);

  // Positie doorgeven zolang er gedeeld wordt.
  useEffect(() => {
    if (!trip) return;

    const send = async () => {
      const point = positionRef.current;
      if (!point) return;

      const now = Date.now();
      if (now - lastPushRef.current < PUSH_INTERVAL_MS) return;
      lastPushRef.current = now;

      try {
        await pushLocation(trip.id, point);
      } catch (error) {
        // Een gemiste update is niet fataal; de volgende poging volgt vanzelf.
        console.error("[SafeBuddy] Positie doorgeven mislukt:", error);
      }
    };

    void send();
    const timer = setInterval(() => void send(), PUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [trip]);

  const start = useCallback(async (input: StartTripInput = {}) => {
    setIsBusy(true);
    try {
      const created = await startTrip(input);
      setTrip(created);
      lastPushRef.current = 0;
      return created;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (!trip) return;
    setIsBusy(true);
    try {
      await endTrip(trip.id, "completed");
      setTrip(null);
    } finally {
      setIsBusy(false);
    }
  }, [trip]);

  const doCheckIn = useCallback(async () => {
    if (!trip) return;
    setIsBusy(true);
    try {
      await checkIn(trip.id);
      setTrip(null);
    } finally {
      setIsBusy(false);
    }
  }, [trip]);

  const extend = useCallback(
    async (extraMinutes: number) => {
      if (!trip) return;
      setIsBusy(true);
      try {
        const newArrival = await extendTrip(trip.id, extraMinutes);
        setTrip((current) => (current ? { ...current, expectedArrival: newArrival } : current));
      } finally {
        setIsBusy(false);
      }
    },
    [trip]
  );

  return {
    trip,
    isSharing: trip !== null,
    isBusy,
    start,
    stop,
    checkIn: doCheckIn,
    extend,
  };
}
