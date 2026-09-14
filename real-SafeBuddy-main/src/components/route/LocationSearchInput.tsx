import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchPlaces, type PlaceSuggestion } from "@/lib/geocoding";
import type { LatLng } from "@/lib/geo";

/**
 * A search box that suggests addresses as the user types.
 *
 * Requests are debounced and the previous one is aborted, so quick typing
 * cannot leave a slow earlier response overwriting a newer one.
 */

const DEBOUNCE_MS = 400;

export interface LocationSearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (suggestion: PlaceSuggestion) => void;
  placeholder: string;
  /** Bias suggestions towards this point. */
  near?: LatLng;
  /** Rendered inside the input, e.g. a "use my location" button. */
  action?: React.ReactNode;
}

const LocationSearchInput = ({
  value,
  onValueChange,
  onSelect,
  placeholder,
  near,
  action,
}: LocationSearchInputProps) => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Set while applying a suggestion, so the resulting value change does not
  // immediately trigger a fresh search for the text we just filled in.
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const results = await searchPlaces(query, { near, signal: controller.signal });
      if (controller.signal.aborted) return;
      setSuggestions(results);
      setIsOpen(results.length > 0);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `near` changes on every map pan; including it would restart the search
    // while the user is still typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close the dropdown when the user interacts elsewhere.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const applySuggestion = (suggestion: PlaceSuggestion) => {
    skipNextSearchRef.current = true;
    setIsOpen(false);
    setSuggestions([]);
    onSelect(suggestion);
  };

  return (
    <div className="relative flex-1" ref={containerRef}>
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        className="h-10 border-0 bg-muted/50 pr-9 text-sm"
      />
      {action}

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-[1100] mt-1 max-h-[300px] overflow-y-auto rounded-lg border-2 border-primary bg-background shadow-2xl">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.lat},${suggestion.lng}-${suggestion.label}`}>
              <button
                type="button"
                onClick={() => applySuggestion(suggestion)}
                className="w-full touch-manipulation border-b px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted active:bg-primary/20"
              >
                <span className="line-clamp-2 break-words font-medium">{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LocationSearchInput;
