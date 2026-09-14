import type { Severity } from "./types";

/**
 * How severity is shown. These colours are data, not chrome: green is safe,
 * amber is caution, red is danger, the same as on the heatmap.
 */
export const SEVERITY_HEX: Record<Severity, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: "Laag",
  medium: "Matig",
  high: "Hoog",
};
