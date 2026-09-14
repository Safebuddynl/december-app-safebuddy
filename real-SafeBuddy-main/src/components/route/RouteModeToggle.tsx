import { ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Veilig ↔ Snel: the core choice in SafeBuddy. A pill with a sliding thumb
 * that switches which of the planned routes is shown.
 */

export type RouteMode = "safe" | "fast";

export interface RouteModeToggleProps {
  value: RouteMode;
  onChange: (mode: RouteMode) => void;
  /** Short extra text per option, e.g. the duration once a route is known. */
  safeDetail?: string;
  fastDetail?: string;
  disabled?: boolean;
}

const OPTIONS = [
  { value: "safe", label: "Veilig", Icon: ShieldCheck },
  { value: "fast", label: "Snel", Icon: Zap },
] as const;

const RouteModeToggle = ({
  value,
  onChange,
  safeDetail,
  fastDetail,
  disabled = false,
}: RouteModeToggleProps) => (
  <div
    role="radiogroup"
    aria-label="Soort route"
    className="glass pointer-events-auto relative grid grid-cols-2 rounded-full p-1 shadow-float"
  >
    {/* The thumb is exactly one cell wide: (100% - padding) / 2. */}
    <span
      aria-hidden="true"
      className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-brand transition-transform duration-300 ease-out motion-reduce:transition-none"
      style={{ transform: value === "fast" ? "translateX(100%)" : "translateX(0)" }}
    />

    {OPTIONS.map(({ value: option, label, Icon }) => {
      const checked = value === option;
      const detail = option === "safe" ? safeDetail : fastDetail;
      return (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "relative z-10 flex h-10 min-w-[6.5rem] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold",
            "transition-colors duration-300 motion-reduce:transition-none disabled:opacity-60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            checked ? "text-white" : "text-ink-soft hover:text-ink"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {label}
          {detail && <span className="text-xs font-medium opacity-80">{detail}</span>}
        </button>
      );
    })}
  </div>
);

export default RouteModeToggle;
