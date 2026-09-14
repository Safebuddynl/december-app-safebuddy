import { Map as MapIcon, Moon, Satellite, SlidersHorizontal, Sun } from "lucide-react";
import type { MapStyle } from "@/components/map/SafeMap";
import { cn } from "@/lib/utils";

/**
 * Small round buttons floating over the map: filters, light/dark map and
 * satellite view.
 */
export interface MapToolsProps {
  filtersOpen: boolean;
  onToggleFilters: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  mapStyle: MapStyle;
  onToggleStyle: () => void;
}

const toolClass = (active: boolean) =>
  cn(
    "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full shadow-float transition-colors motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50",
    active ? "bg-brand-tint text-brand" : "glass text-ink hover:bg-tint"
  );

const MapTools = ({
  filtersOpen,
  onToggleFilters,
  isDark,
  onToggleDark,
  mapStyle,
  onToggleStyle,
}: MapToolsProps) => {
  const isSatellite = mapStyle === "satellite";

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onToggleFilters}
        aria-label="Filters"
        aria-pressed={filtersOpen}
        className={toolClass(filtersOpen)}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onToggleDark}
        disabled={isSatellite}
        aria-label={isDark ? "Lichte kaart" : "Donkere kaart"}
        className={toolClass(false)}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onToggleStyle}
        aria-label={isSatellite ? "Kaartweergave" : "Satellietweergave"}
        aria-pressed={isSatellite}
        className={toolClass(isSatellite)}
      >
        {isSatellite ? <MapIcon className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
      </button>
    </div>
  );
};

export default MapTools;
