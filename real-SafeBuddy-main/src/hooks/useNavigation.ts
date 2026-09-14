import { useCallback, useEffect, useRef, useState } from "react";
import { distanceKm, type LatLng } from "@/lib/geo";
import type { PlannedRoute } from "@/lib/routing/directions";

/**
 * Turn-by-turn navigation state, driven by the browser's GPS watch.
 *
 * The hook owns the `watchPosition` subscription and guarantees it is torn
 * down on stop and on unmount, which is what stops the GPS icon from staying
 * on after the user leaves the page.
 */

/** A step is considered reached within this distance. */
const STEP_REACHED_KM = 0.05;

export interface NavigationState {
  isNavigating: boolean;
  position: LatLng | null;
  /** Compass heading in degrees, or 0 when the device does not report one. */
  heading: number;
  /** Index into the active route's steps. */
  stepIndex: number;
  /** Metres to the next manoeuvre, or `null` when unknown. */
  metersToNextTurn: number | null;
  /** True once the user is more than 200 m from the route. */
  isOffRoute: boolean;
}

export interface UseNavigationResult extends NavigationState {
  start: (route: PlannedRoute) => void;
  stop: () => void;
}

const INITIAL: NavigationState = {
  isNavigating: false,
  position: null,
  heading: 0,
  stepIndex: 0,
  metersToNextTurn: null,
  isOffRoute: false,
};

export function useNavigation(
  onPositionChange?: (position: LatLng) => void
): UseNavigationResult {
  const [state, setState] = useState<NavigationState>(INITIAL);

  const watchIdRef = useRef<number | null>(null);
  const routeRef = useRef<PlannedRoute | null>(null);
  const stepIndexRef = useRef(0);
  // Held in a ref so the watch callback always sees the latest handler
  // without having to resubscribe.
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearWatch();
    routeRef.current = null;
    stepIndexRef.current = 0;
    setState(INITIAL);
  }, [clearWatch]);

  const start = useCallback(
    (route: PlannedRoute) => {
      if (!navigator.geolocation) throw new Error("geolocation-unsupported");

      clearWatch();
      routeRef.current = route;
      stepIndexRef.current = 0;
      setState({ ...INITIAL, isNavigating: true });

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const point: LatLng = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          onPositionChangeRef.current?.(point);
          setState((current) => ({
            ...current,
            position: point,
            heading: position.coords.heading ?? current.heading,
            ...progressAlongRoute(point, routeRef.current, stepIndexRef),
          }));
        },
        (error) => {
          // A single failed fix should not end navigation; the watch keeps
          // running and usually recovers.
          console.warn("[SafeBuddy] GPS update failed:", error.message);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5_000 }
      );
    },
    [clearWatch]
  );

  // Never leave a GPS watch running after the component goes away.
  useEffect(() => clearWatch, [clearWatch]);

  return { ...state, start, stop };
}

/**
 * Work out which step the user is on and how far the next turn is.
 *
 * Steps are only ever advanced, never rewound, so a noisy GPS fix near an
 * earlier part of the route cannot send the instructions backwards.
 */
function progressAlongRoute(
  position: LatLng,
  route: PlannedRoute | null,
  stepIndexRef: { current: number }
): Pick<NavigationState, "stepIndex" | "metersToNextTurn" | "isOffRoute"> {
  const steps = route?.steps ?? [];
  if (steps.length === 0) {
    return { stepIndex: 0, metersToNextTurn: null, isOffRoute: false };
  }

  const current = Math.min(stepIndexRef.current, steps.length - 1);
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nextIndex = current;

  for (let i = current; i < steps.length; i++) {
    const start = steps[i].coordinates[0];
    if (!start) continue;

    const distance = distanceKm(position.lat, position.lng, start[0], start[1]);
    if (distance < nearestDistance) nearestDistance = distance;
    if (distance < STEP_REACHED_KM) nextIndex = Math.min(i + 1, steps.length - 1);
  }

  stepIndexRef.current = nextIndex;

  const upcoming = steps[nextIndex]?.coordinates[0];
  const metersToNextTurn = upcoming
    ? Math.round(distanceKm(position.lat, position.lng, upcoming[0], upcoming[1]) * 1000)
    : null;

  return {
    stepIndex: nextIndex,
    metersToNextTurn,
    isOffRoute: nearestDistance > 0.2,
  };
}
