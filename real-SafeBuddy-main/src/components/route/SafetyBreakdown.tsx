import { AlertTriangle, Lightbulb, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { safetyLabel, type RouteSafety } from "@/lib/routing/safety";
import { cn } from "@/lib/utils";

/**
 * Why a route scored what it did.
 *
 * A bare number does not help anyone decide whether to walk somewhere, so
 * this shows what actually drove it: the reports, the population correction,
 * the lighting, and the time of day.
 */
export interface SafetyBreakdownProps {
  safety: RouteSafety;
  /** One or two sentences summarising the factors below. */
  explanation: string | null;
  /** Drop the card chrome when shown inside another panel. */
  embedded?: boolean;
}

const FACTOR_ICON = {
  reports: AlertTriangle,
  darkness: Lightbulb,
  isolation: Users,
} as const;

const SafetyBreakdown = ({ safety, explanation, embedded = false }: SafetyBreakdownProps) => {
  const tone = safetyLabel(safety.score);

  return (
    <Card
      className={cn(
        "border-0 bg-background/95 shadow-lg backdrop-blur-sm",
        embedded && "bg-transparent shadow-none backdrop-blur-none"
      )}
    >
      <CardContent className={cn("space-y-3", embedded ? "p-0" : "p-3")}>
        <div className="flex items-center gap-2">
          <span
            className={`text-2xl font-bold ${
              tone === "safe"
                ? "text-success"
                : tone === "caution"
                  ? "text-warning"
                  : "text-destructive"
            }`}
          >
            {safety.score}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
          <Badge variant="outline" className="ml-auto text-xs">
            {safety.time.label}
          </Badge>
        </div>

        {explanation && (
          <p className="text-sm leading-snug text-muted-foreground">{explanation}</p>
        )}

        {safety.factors.length > 0 && (
          <ul className="space-y-1.5 border-t border-muted pt-2">
            {safety.factors.map((factor) => {
              const Icon = FACTOR_ICON[factor.key];
              return (
                <li key={factor.key} className="flex items-start gap-2 text-xs">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-muted-foreground">{factor.detail}</span>
                </li>
              );
            })}
          </ul>
        )}

        {safety.lighting === null && safety.time.isDark && (
          <p className="text-[11px] text-muted-foreground/70">
            Verlichtingsdata kon niet worden opgehaald, dus die telt niet mee.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default SafetyBreakdown;
