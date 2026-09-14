import type { Map as MapboxMap, StyleSpecification } from "mapbox-gl";
import { MAPBOX_TOKEN } from "@/lib/env";

/**
 * Basemap styles and small helpers shared by every Mapbox GL map in the app.
 *
 * The default basemap is Mapbox Standard in its "dusk" light: a muted
 * purple-grey city with green parks, buildings and points of interest. It is
 * calm enough for the heatmap and route to stand out, without the glare of an
 * all-white map or the gloom of an all-black one.
 */

export type MapStyle = "navigation" | "satellite";

export const MAP_STYLE_URLS = {
  standard: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;

/** Used when no Mapbox token is configured, so the app still shows a map. */
const OSM_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "&copy; OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

export function resolveMapStyle(mapStyle: MapStyle): string | StyleSpecification {
  if (!MAPBOX_TOKEN) return OSM_FALLBACK_STYLE;
  return mapStyle === "satellite" ? MAP_STYLE_URLS.satellite : MAP_STYLE_URLS.standard;
}

/** A stable identity for a resolved style, to tell style reloads apart. */
export const styleKeyOf = (style: string | StyleSpecification) =>
  typeof style === "string" ? style : "osm-fallback";

/**
 * Mapbox Standard places custom layers through named slots ("bottom",
 * "middle", "top") instead of `beforeId`.
 */
export const usesSlots = (style: string | StyleSpecification) =>
  style === MAP_STYLE_URLS.standard;

/**
 * Set the Standard basemap's look. Dark mode switches the light preset
 * rather than the style, so it changes smoothly without reloading tiles.
 */
export function applyBasemapLook(map: MapboxMap, isDark: boolean): void {
  try {
    map.setConfigProperty("basemap", "lightPreset", isDark ? "night" : "dusk");
    map.setConfigProperty("basemap", "showPointOfInterestLabels", true);
  } catch (error) {
    console.warn("[SafeBuddy] Kon de kaartstijl niet instellen:", error);
  }
}

/**
 * The first symbol layer that draws text, for classic styles. Data layers are
 * inserted below it, so street names stay readable on top of the heatmap.
 */
export function findLabelLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find(
    (layer) => layer.type === "symbol" && layer.layout !== undefined && "text-field" in layer.layout
  )?.id;
}

/**
 * Read a colour token from CSS. Mapbox paint properties cannot reference CSS
 * variables, so the value is resolved once here instead of copying the hex.
 */
export function readCssColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
