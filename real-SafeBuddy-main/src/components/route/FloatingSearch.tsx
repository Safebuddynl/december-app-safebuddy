import { useState } from "react";
import {
  Bike,
  Car,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Footprints,
  Loader2,
  Locate,
  Search,
  X,
} from "lucide-react";
import type { LatLng } from "@/lib/geo";
import type { PlaceSuggestion } from "@/lib/geocoding";
import type { TravelMode } from "@/lib/routing/directions";
import { cn } from "@/lib/utils";
import LocationSearchInput from "./LocationSearchInput";

/**
 * The floating search bar: "Waar naartoe?" first, the starting point folded
 * away as "Van: Mijn locatie" until the user wants to change it.
 *
 * Suggestions come from the existing geocoding search inside
 * `LocationSearchInput`.
 */

const TRAVEL_MODES: { value: TravelMode; label: string; Icon: typeof Footprints }[] = [
  { value: "foot", label: "Lopen", Icon: Footprints },
  { value: "bike", label: "Fietsen", Icon: Bike },
  { value: "car", label: "Auto", Icon: Car },
];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

export interface FloatingSearchProps {
  destinationText: string;
  onDestinationTextChange: (value: string) => void;
  onDestinationSelect: (suggestion: PlaceSuggestion) => void;
  onClearDestination: () => void;
  startText: string;
  onStartTextChange: (value: string) => void;
  onStartSelect: (suggestion: PlaceSuggestion) => void;
  /** Name of the chosen start, or null for "my location". */
  startLabel: string | null;
  onUseMyLocation: () => void;
  travelMode: TravelMode;
  onTravelModeChange: (mode: TravelMode) => void;
  isPlanning: boolean;
  /** Both ends are known but no route is shown, e.g. after a failure. */
  canPlan: boolean;
  onPlan: () => void;
  near: LatLng;
}

const FloatingSearch = ({
  destinationText,
  onDestinationTextChange,
  onDestinationSelect,
  onClearDestination,
  startText,
  onStartTextChange,
  onStartSelect,
  startLabel,
  onUseMyLocation,
  travelMode,
  onTravelModeChange,
  isPlanning,
  canPlan,
  onPlan,
  near,
}: FloatingSearchProps) => {
  const [isStartOpen, setIsStartOpen] = useState(false);

  return (
    <div role="search" className="glass pointer-events-auto rounded-panel text-ink shadow-float">
      <div className="px-3 pt-2">
        {isStartOpen ? (
          <div className="flex items-center gap-2 py-1">
            <CircleDot className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <LocationSearchInput
              value={startText}
              onValueChange={onStartTextChange}
              onSelect={(suggestion) => {
                onStartSelect(suggestion);
                setIsStartOpen(false);
              }}
              placeholder="Startpunt"
              ariaLabel="Startpunt"
              near={near}
              inputClassName="rounded-full bg-tint text-ink placeholder:text-ink-soft"
              action={
                <button
                  type="button"
                  onClick={() => {
                    onUseMyLocation();
                    setIsStartOpen(false);
                  }}
                  aria-label="Mijn locatie als startpunt"
                  className={cn(
                    "absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-brand hover:bg-brand-tint",
                    focusRing
                  )}
                >
                  <Locate className="h-4 w-4" />
                </button>
              }
            />
            <button
              type="button"
              onClick={() => setIsStartOpen(false)}
              aria-label="Startpunt inklappen"
              aria-expanded="true"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-tint",
                focusRing
              )}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsStartOpen(true)}
            aria-expanded="false"
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg px-1 text-left text-sm text-ink-soft hover:text-ink",
              focusRing
            )}
          >
            <CircleDot className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="shrink-0">Van</span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink">
              {startLabel ?? "Mijn locatie"}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 pb-1">
        <Search className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
        <LocationSearchInput
          value={destinationText}
          onValueChange={onDestinationTextChange}
          onSelect={onDestinationSelect}
          placeholder="Waar naartoe?"
          ariaLabel="Bestemming"
          near={near}
          inputClassName="h-11 bg-transparent px-1 text-base font-medium text-ink placeholder:text-ink-soft focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {destinationText && (
          <button
            type="button"
            onClick={onClearDestination}
            aria-label="Bestemming wissen"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-tint",
              focusRing
            )}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mx-4 flex items-center gap-1 border-t border-line py-1.5">
        <div role="radiogroup" aria-label="Vervoer" className="flex gap-1">
          {TRAVEL_MODES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={travelMode === value}
              aria-label={label}
              onClick={() => onTravelModeChange(value)}
              className={cn(
                "flex h-9 w-11 items-center justify-center rounded-full transition-colors motion-reduce:transition-none",
                travelMode === value
                  ? "bg-brand-tint text-brand"
                  : "text-ink-soft hover:bg-tint hover:text-ink",
                focusRing
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center">
          {isPlanning ? (
            <span role="status" className="flex items-center gap-1.5 px-2 text-xs text-ink-soft">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              Route berekenen…
            </span>
          ) : (
            canPlan && (
              <button
                type="button"
                onClick={onPlan}
                className={cn(
                  "h-9 rounded-full bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-hover",
                  focusRing
                )}
              >
                Route plannen
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default FloatingSearch;
