import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";
import ReportLocationDialog from "@/components/ReportLocationDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useReports } from "@/hooks/useReports";
import { useLanguage } from "@/i18n/LanguageContext";
import {
  DEFAULT_FILTERS,
  TIME_FILTERS,
  applyFilters,
  type SeverityFilter,
} from "@/lib/reports/filters";
import { canDelete, canLike, deleteSafetyReport, toggleReportLike } from "@/lib/reports/mutations";
import { formatRelativeTime, type SafetyReport, type Severity } from "@/lib/reports/types";

/**
 * The community feed: every report, newest first, with time and severity
 * filters. Reports come from the same loader the map uses.
 */

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "Alles" },
  { value: "high", label: "Hoog" },
  { value: "medium", label: "Gemiddeld" },
  { value: "low", label: "Laag" },
];

const SEVERITY_BADGE: Record<Severity, string> = {
  high: "bg-destructive text-destructive-foreground",
  medium: "bg-warning text-warning-foreground",
  low: "bg-muted text-muted-foreground",
};

const SEVERITY_ICON: Record<Severity, string> = {
  high: "bg-destructive/20 text-destructive",
  medium: "bg-warning/20 text-warning",
  low: "bg-muted text-muted-foreground",
};

/**
 * How many cards to render at once.
 *
 * The feed holds roughly 15.000 reports. Rendering them all would put tens of
 * thousands of nodes in the DOM and lock the page up for seconds, so the list
 * grows on demand instead. Every report stays reachable.
 */
const PAGE_SIZE = 50;

const Community = () => {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const { reports, counts, isLoading, error, refresh, patchReport, removeReport } = useReports();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [renderCount, setRenderCount] = useState(PAGE_SIZE);

  const matching = useMemo(() => applyFilters(reports, filters), [reports, filters]);

  // Start again from the top whenever the filters change, so a narrower filter
  // does not leave the reader scrolled into a list that no longer exists.
  useEffect(() => setRenderCount(PAGE_SIZE), [filters]);

  const visible = useMemo(() => matching.slice(0, renderCount), [matching, renderCount]);
  const hasMore = renderCount < matching.length;

  const handleLike = async (report: SafetyReport) => {
    try {
      const { liked, upvotes } = await toggleReportLike(report.id);
      patchReport(report.id, { upvotes });
      toast.success(liked ? "Melding geliket" : "Like verwijderd");
    } catch (cause) {
      toast.error(
        cause instanceof Error && cause.message === "not-authenticated"
          ? "Log in om te liken"
          : "Kon de like niet opslaan"
      );
    }
  };

  const handleDelete = async (report: SafetyReport) => {
    try {
      await deleteSafetyReport(report.id);
      removeReport(report.id);
      toast.success("Melding verwijderd");
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      toast.error(
        reason === "not-authenticated"
          ? "Log in om te verwijderen"
          : reason === "not-owner"
            ? "Je kunt alleen je eigen meldingen verwijderen"
            : "Kon de melding niet verwijderen"
      );
    }
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-background pb-20">
      <div className="gradient-header px-4 pb-8 pt-12">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="mb-1 text-2xl font-bold text-primary-foreground">
            {t("communityReports")}
          </h1>
          <p className="text-sm text-primary-foreground/80">{t("viewAllReports")}</p>
        </div>
      </div>

      <div className="-mt-4 mx-auto max-w-2xl px-4">
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="gradient-primary mb-6 w-full shadow-lg hover:opacity-90"
        >
          <Plus className="mr-2 h-5 w-5" />
          {t("reportLocation")}
        </Button>

        <div className="mb-6 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Periode</p>
            <div className="flex flex-wrap gap-2">
              {TIME_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, time: value }))}
                  className={`rounded px-3 py-2 text-xs font-medium transition-colors ${
                    filters.time === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t("severity")}</p>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilters((current) => ({ ...current, severity: value }))}
                  className={`rounded px-3 py-2 text-xs font-medium transition-colors ${
                    filters.severity === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {label}
                  {value !== "all" && ` (${counts[value as Severity]})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!isLoading && !error && matching.length > 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            {matching.length === reports.length
              ? `${reports.length.toLocaleString("nl-NL")} meldingen`
              : `${matching.length.toLocaleString("nl-NL")} van ${reports.length.toLocaleString("nl-NL")} meldingen`}
          </p>
        )}

        <div className="space-y-4">
          {isLoading && <EmptyState message={`${t("loading")}...`} />}
          {!isLoading && error && <EmptyState message={error} />}
          {!isLoading && !error && matching.length === 0 && (
            <EmptyState message="Geen meldingen in deze periode" />
          )}

          {visible.map((report) => (
            <Card key={report.id} className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${SEVERITY_ICON[report.severity]}`}
                  >
                    <AlertTriangle className="h-6 w-6" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="font-semibold">{report.reportType}</h3>
                          {report.source === "kro" && (
                            <Badge
                              variant="outline"
                              className="border-blue-500/20 bg-blue-500/10 text-xs text-blue-500"
                            >
                              Geverifieerd
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {report.locationAddress}
                        </p>
                      </div>
                      <Badge className={SEVERITY_BADGE[report.severity]}>
                        {report.severity === "high"
                          ? "Hoog"
                          : report.severity === "medium"
                            ? "Gemiddeld"
                            : "Laag"}
                      </Badge>
                    </div>

                    {report.description && (
                      <p className="mb-3 text-sm text-muted-foreground">{report.description}</p>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(report.createdAt)}
                      </span>

                      <div className="flex items-center gap-2">
                        {canLike(report) && (
                          <button
                            type="button"
                            onClick={() => void handleLike(report)}
                            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
                          >
                            <ThumbsUp className="h-4 w-4" />
                            <span>{report.upvotes}</span>
                          </button>
                        )}
                        {canDelete(report, user?.id ?? null) && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(report)}
                            aria-label="Verwijder melding"
                            className="p-1 text-destructive transition-colors hover:text-destructive/80"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setRenderCount((count) => count + PAGE_SIZE)}
            >
              Meer laden ({(matching.length - renderCount).toLocaleString("nl-NL")} resterend)
            </Button>
          )}
        </div>
      </div>

      <ReportLocationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onReportSubmitted={refresh}
      />

      <BottomNav />
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <Card>
    <CardContent className="p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
      <p className="text-muted-foreground">{message}</p>
    </CardContent>
  </Card>
);

export default Community;
