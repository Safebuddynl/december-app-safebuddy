import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/i18n/LanguageContext";
import { safetyLabel, type RouteWarning } from "@/lib/routing/safety";

/**
 * The dialog shown after planning a route that passes reported problem spots.
 *
 * Warnings arrive as structured objects, so the severity of each is read from
 * a field rather than parsed back out of a translated sentence.
 */
export interface RouteWarningsDialogProps {
  warnings: readonly RouteWarning[];
  /** Total before the display cap, so the count is not misleading. */
  totalWarnings: number;
  safetyScore: number;
  onDismiss: () => void;
}

const RouteWarningsDialog = ({
  warnings,
  totalWarnings,
  safetyScore,
  onDismiss,
}: RouteWarningsDialogProps) => {
  const { t } = useLanguage();

  if (warnings.length === 0) return null;

  const tone = safetyLabel(safetyScore);
  const headerTone =
    tone === "safe"
      ? "from-success/20 to-success/10"
      : tone === "caution"
        ? "from-warning/20 to-warning/10"
        : "from-destructive/20 to-destructive/10";

  return (
    <div className="absolute inset-0 z-[3500] flex items-center justify-center bg-black/60 p-4">
      <Card className="w-full max-w-md overflow-hidden border-0 bg-background shadow-2xl">
        <div className={`bg-gradient-to-r p-5 ${headerTone}`}>
          <div className="mb-1 flex items-center gap-3">
            <div className="rounded-full bg-background/60 p-2">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold">{t("safetyAttention")}</h3>
          </div>
          <p className="ml-11 text-xs text-muted-foreground">
            {totalWarnings} {t("warningsOnRoute")}
            {totalWarnings > warnings.length && ` — de ${warnings.length} ernstigste hieronder`}
          </p>
        </div>

        <CardContent className="p-4">
          <ul className="max-h-[340px] space-y-3 overflow-y-auto">
            {warnings.map((warning, index) => (
              <li
                key={`${warning.reportType}-${warning.locationAddress}-${index}`}
                className={`rounded-lg border p-3 ${
                  warning.severity === "high"
                    ? "border-destructive/40 bg-destructive/10"
                    : "border-warning/40 bg-warning/10"
                }`}
              >
                <div className="flex items-start gap-2">
                  <Badge
                    className={`mt-0.5 shrink-0 text-xs font-bold ${
                      warning.severity === "high"
                        ? "bg-destructive/20 text-destructive"
                        : "bg-warning/20 text-warning"
                    }`}
                  >
                    {warning.severity === "high" ? t("highRisk") : t("mediumRisk")}
                  </Badge>
                  <p className="flex-1 text-sm font-medium leading-snug">{warning.reportType}</p>
                </div>
                <p className="ml-2 mt-2 text-xs text-muted-foreground">
                  {warning.locationAddress}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-muted pt-4">
            <Button onClick={onDismiss} className="w-full">
              {t("alertAndProceed")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RouteWarningsDialog;
