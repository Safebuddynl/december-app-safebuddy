import { useState } from "react";
import { Heart, MapPin, Trash2 } from "lucide-react";
import { formatDistanceNl } from "@/lib/reports/feed";
import { getReportTypeMeta } from "@/lib/reports/reportTypes";
import { formatRelativeTime, type SafetyReport, type Severity } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/**
 * One report in the community feed.
 *
 * Only presentation lives here: liking and deleting are passed in, so the
 * page keeps the exact write logic it had.
 */

export interface CommunityReportCardProps {
  report: SafetyReport;
  isLiked: boolean;
  canLike: boolean;
  canDelete: boolean;
  /** Shown as a chip when set, e.g. in "in de buurt" mode. */
  distanceKm?: number | null;
  onLike: (report: SafetyReport) => void;
  onDelete: (report: SafetyReport) => void;
}

/** Tile behind the type icon: red, amber or green by severity. */
const SEVERITY_TILE: Record<Severity, string> = {
  high: "bg-destructive/20 text-destructive",
  medium: "bg-warning/20 text-warning",
  low: "bg-success/20 text-success",
};

const SEVERITY_PILL: Record<Severity, { label: string; className: string }> = {
  high: { label: "Hoog", className: "bg-destructive/15 text-destructive" },
  medium: { label: "Matig", className: "bg-warning/15 text-warning" },
  low: { label: "Laag", className: "bg-muted text-muted-foreground" },
};

/** Descriptions longer than this probably need more than two lines. */
const LONG_DESCRIPTION = 110;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const CommunityReportCard = ({
  report,
  isLiked,
  canLike,
  canDelete,
  distanceKm = null,
  onLike,
  onDelete,
}: CommunityReportCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { label: typeLabel, Icon } = getReportTypeMeta(report);
  const pill = SEVERITY_PILL[report.severity];
  const relativeTime = formatRelativeTime(report.createdAt);
  const isLong = report.description.length > LONG_DESCRIPTION;
  const hasFooter = canLike || canDelete || distanceKm !== null;

  return (
    <article className="rounded-2xl bg-card p-4 text-card-foreground shadow-card">
      <div className="flex gap-3">
        <div
          aria-hidden="true"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            SEVERITY_TILE[report.severity]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-semibold leading-tight">
              {report.locationAddress}
            </h3>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                pill.className
              )}
            >
              {pill.label}
            </span>
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {relativeTime ? `${relativeTime} · ${typeLabel}` : typeLabel}
          </p>

          {report.description && (
            <div className="mt-2">
              <p
                className={cn(
                  "whitespace-pre-line text-sm text-foreground/80",
                  !isExpanded && "line-clamp-2"
                )}
              >
                {report.description}
              </p>
              {isLong && (
                <button
                  type="button"
                  onClick={() => setIsExpanded((open) => !open)}
                  aria-expanded={isExpanded}
                  className={cn("mt-1 rounded text-xs font-semibold text-primary", focusRing)}
                >
                  {isExpanded ? "Minder tonen" : "Meer lezen"}
                </button>
              )}
            </div>
          )}

          {hasFooter && (
            <div className="mt-3 flex items-center gap-2">
              {canLike && (
                <button
                  type="button"
                  onClick={() => onLike(report)}
                  aria-pressed={isLiked}
                  aria-label={isLiked ? "Like verwijderen" : "Liken"}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors motion-reduce:transition-none",
                    isLiked
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                      : "bg-muted text-muted-foreground hover:bg-primary-tint hover:text-primary",
                    focusRing
                  )}
                >
                  <Heart className={cn("h-4 w-4", isLiked && "fill-current")} aria-hidden="true" />
                  {report.upvotes}
                </button>
              )}

              {distanceKm !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Afstand: </span>
                  {formatDistanceNl(distanceKm)}
                </span>
              )}

              {canDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(report)}
                  aria-label="Melding verwijderen"
                  className={cn(
                    "ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive motion-reduce:transition-none",
                    focusRing
                  )}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

export default CommunityReportCard;
