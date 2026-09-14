import { useCallback, useEffect, useState } from "react";

/**
 * Safety preferences, stored on this device.
 *
 * There is no preferences table, and the schema may not change, so these
 * follow the same pattern as the theme and language: localStorage. Every
 * component using the hook stays in sync, also across browser tabs.
 */

export type RouteModePreference = "safe" | "fast";

export interface SafetyPreferences {
  /** Which route the map shows first after planning. */
  defaultRouteMode: RouteModePreference;
  pushNotifications: boolean;
  safetyAlerts: boolean;
  communityUpdates: boolean;
}

export const DEFAULT_SAFETY_PREFERENCES: SafetyPreferences = {
  defaultRouteMode: "safe",
  pushNotifications: true,
  safetyAlerts: true,
  communityUpdates: false,
};

const STORAGE_KEY = "safebuddy-safety-preferences";
const CHANGE_EVENT = "safebuddy-safety-preferences-change";

/** The stored preferences, with defaults for anything missing or invalid. */
export function readSafetyPreferences(): SafetyPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SAFETY_PREFERENCES;

    const stored = JSON.parse(raw) as Partial<Record<keyof SafetyPreferences, unknown>>;
    const flag = (key: "pushNotifications" | "safetyAlerts" | "communityUpdates") =>
      typeof stored[key] === "boolean" ? (stored[key] as boolean) : DEFAULT_SAFETY_PREFERENCES[key];

    return {
      defaultRouteMode:
        stored.defaultRouteMode === "fast" || stored.defaultRouteMode === "safe"
          ? stored.defaultRouteMode
          : DEFAULT_SAFETY_PREFERENCES.defaultRouteMode,
      pushNotifications: flag("pushNotifications"),
      safetyAlerts: flag("safetyAlerts"),
      communityUpdates: flag("communityUpdates"),
    };
  } catch {
    // Storage can be unavailable, e.g. in a private window.
    return DEFAULT_SAFETY_PREFERENCES;
  }
}

export function useSafetyPreferences() {
  const [preferences, setPreferences] = useState<SafetyPreferences>(readSafetyPreferences);

  useEffect(() => {
    const sync = () => setPreferences(readSafetyPreferences());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((changes: Partial<SafetyPreferences>) => {
    const next = { ...readSafetyPreferences(), ...changes };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Keep the choice for this session even if it cannot be stored.
    }
    setPreferences(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { preferences, update };
}
