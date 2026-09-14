import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { formatDistance } from "@/lib/geo";
import { turnForStep, type Turn } from "@/lib/navigation/maneuvers";
import type { PlannedRoute } from "@/lib/routing/directions";

/**
 * The turn-by-turn banner shown at the top while navigating: a turn arrow,
 * the distance to it, the instruction, and a preview of the turn after.
 */
export interface NavigationPanelProps {
  route: PlannedRoute;
  stepIndex: number;
  metersToNextTurn: number | null;
  isOffRoute: boolean;
}

const TURN_ICON: Record<Turn, LucideIcon> = {
  depart: ArrowUp,
  straight: ArrowUp,
  "slight-left": ArrowUpLeft,
  left: CornerUpLeft,
  "sharp-left": CornerUpLeft,
  "slight-right": ArrowUpRight,
  right: CornerUpRight,
  "sharp-right": CornerUpRight,
  uturn: Undo2,
  arrive: Flag,
};

const NavigationPanel = ({ route, stepIndex, metersToNextTurn, isOffRoute }: NavigationPanelProps) => {
  const steps = route.steps;
  const step = steps[stepIndex];
  const hasArrived = !step || (stepIndex >= steps.length - 1 && (metersToNextTurn ?? 0) < 20);

  const TurnIcon = TURN_ICON[turnForStep(steps, stepIndex)];
  const next = steps[stepIndex + 1];
  const NextIcon = TURN_ICON[turnForStep(steps, stepIndex + 1)];

  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-2xl text-white shadow-[0_8px_30px_rgba(27,23,37,0.28)]"
      style={{ background: "var(--brand)" }}
    >
      {hasArrived ? (
        <div className="flex items-center gap-3 p-4">
          <Flag className="h-8 w-8 shrink-0" strokeWidth={2.5} />
          <div>
            <p className="text-lg font-bold leading-tight">Je bent aangekomen</p>
            <p className="text-sm text-white/80">Bestemming bereikt</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 p-3 sm:p-4">
            <TurnIcon className="h-10 w-10 shrink-0" strokeWidth={2.75} />
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold leading-none tabular-nums">
                {formatDistance(metersToNextTurn ?? step.distance)}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-white/90">
                {step.instruction}
              </p>
            </div>
          </div>

          {next && (
            <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 text-xs sm:px-4">
              <span className="text-white/75">Daarna</span>
              <NextIcon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              <span className="truncate font-medium">{next.instruction}</span>
            </div>
          )}

          {isOffRoute && (
            <div className="bg-amber-400 px-3 py-1.5 text-xs font-semibold text-[#1B1725] sm:px-4">
              Je lijkt van de route af te wijken
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NavigationPanel;
