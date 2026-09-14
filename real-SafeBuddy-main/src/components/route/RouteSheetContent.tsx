import { Navigation, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageContext";
import { formatDistance, formatDuration } from "@/lib/geo";
import type { PlannedRoute } from "@/lib/routing/directions";
import { safetyLabel } from "@/lib/routing/safety";
import { cn } from "@/lib/utils";

/**
 * The always-visible top parts of the route sheet: a compact route summary
 * before starting, and the arrival bar while navigating.
 */

const TONE_CLASS = {
  safe: "text-success",
  caution: "text-warning",
  risky: "text-destructive",
} as const;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2";

const ScoreBadge = ({ score, size = "md" }: { score: number; size?: "sm" | "md" }) => (
  <div
    role="img"
    aria-label={`Veiligheidsscore ${score} van 100`}
    className={cn(
      "flex shrink-0 items-center justify-center rounded-full border-[3px] border-current font-bold tabular-nums",
      TONE_CLASS[safetyLabel(score)],
      size === "md" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm"
    )}
  >
    {score}
  </div>
);

export interface RouteOverviewPeekProps {
  route: PlannedRoute;
  onStart: () => void;
  onHide: () => void;
}

export const RouteOverviewPeek = ({ route, onStart, onHide }: RouteOverviewPeekProps) => {
  const { t } = useLanguage();
  const tone = safetyLabel(route.safety.score);
  const title = tone === "safe" ? t("safeRoute") : tone === "caution" ? t("caution") : t("beCareful");
  const nearby = route.safety.reportsNearRoute;

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-3">
        <ScoreBadge score={route.safety.score} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-tight">{title}</p>
          <p className="truncate text-sm text-muted-foreground">
            {route.durationLabel} · {route.distanceLabel}
            {nearby > 0 && ` · ${nearby} meldingen dichtbij`}
          </p>
        </div>
        <button
          type="button"
          onClick={onHide}
          aria-label="Routepaneel verbergen"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground",
            focusRing
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Button onClick={onStart} className="mt-3 h-12 w-full rounded-2xl text-base font-semibold">
        <Navigation className="mr-2 h-5 w-5" />
        Start
      </Button>
    </div>
  );
};

export interface NavigationPeekProps {
  arrival: Date;
  remainingSeconds: number;
  remainingMeters: number;
  score: number;
  onStop: () => void;
}

export const NavigationPeek = ({
  arrival,
  remainingSeconds,
  remainingMeters,
  score,
  onStop,
}: NavigationPeekProps) => (
  <div className="flex items-center gap-3 px-4 pb-4">
    <div className="min-w-0 flex-1">
      <p className="text-2xl font-bold leading-none tabular-nums">
        {arrival.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
        <span className="ml-1.5 text-xs font-medium text-muted-foreground">aankomst</span>
      </p>
      <p className="mt-1 truncate text-sm text-muted-foreground">
        {formatDuration(remainingSeconds)} · {formatDistance(remainingMeters)}
      </p>
    </div>
    <ScoreBadge score={score} size="sm" />
    <button
      type="button"
      onClick={onStop}
      aria-label="Navigatie stoppen"
      className={cn(
        "flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold hover:bg-muted/80",
        focusRing
      )}
    >
      <X className="h-4 w-4" />
      Stop
    </button>
  </div>
);
