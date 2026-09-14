import { AlertTriangle, Share2 } from "lucide-react";
import { formatDistance } from "@/lib/geo";
import type { NearbyReport } from "@/lib/reports/nearby";
import { SEVERITY_HEX, SEVERITY_LABEL } from "@/lib/reports/severity";
import { formatRelativeTime, type MappedReport, type Severity } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/**
 * The bottom sheet when no route is planned: the two main actions, and the
 * reports around the part of the map the user is looking at.
 */

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

export const SeverityBadge = ({ severity }: { severity: Severity }) => (
  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tint px-2 py-0.5 text-xs font-medium text-ink">
    <span
      aria-hidden="true"
      className="h-2 w-2 rounded-full"
      style={{ background: SEVERITY_HEX[severity] }}
    />
    {SEVERITY_LABEL[severity]}
  </span>
);

export interface HomeSheetPeekProps {
  onReport: () => void;
  onShare: () => void;
  isSharing: boolean;
}

export const HomeSheetPeek = ({ onReport, onShare, isSharing }: HomeSheetPeekProps) => (
  <div className="grid grid-cols-2 gap-2 px-3 pb-3">
    <button
      type="button"
      onClick={onReport}
      className={cn(
        "flex h-11 items-center justify-center gap-1.5 rounded-full bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-hover",
        focusRing
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      Meld gevaar
    </button>

    <button
      type="button"
      onClick={onShare}
      className={cn(
        "flex h-11 items-center justify-center gap-1.5 rounded-full border border-line bg-white/50 px-3 text-sm font-semibold text-ink hover:bg-white/80 dark:bg-white/10 dark:hover:bg-white/20",
        focusRing
      )}
    >
      {isSharing ? (
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
        </span>
      ) : (
        <Share2 className="h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
      )}
      {isSharing ? "Je deelt live" : "Deel live-locatie"}
    </button>
  </div>
);

export interface NearbyReportsProps {
  items: NearbyReport[];
  radiusLabel: string;
  onSelect: (item: MappedReport) => void;
}

export const NearbyReports = ({ items, radiusLabel, onSelect }: NearbyReportsProps) => (
  <section aria-labelledby="nearby-reports-title">
    <h2 id="nearby-reports-title" className="mb-1 text-sm font-semibold text-ink">
      Meldingen in de buurt
    </h2>

    {items.length === 0 ? (
      <p className="py-2 text-sm text-ink-soft">
        Geen meldingen binnen {radiusLabel} van het midden van de kaart.
      </p>
    ) : (
      <ul className="divide-y divide-line">
        {items.map(({ item, distanceKm }) => (
          <li key={item.report.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-tint",
                focusRing
              )}
            >
              <SeverityBadge severity={item.report.severity} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {item.report.reportType}
                </span>
                <span className="block truncate text-xs text-ink-soft">
                  {item.report.locationAddress}
                  {formatRelativeTime(item.report.createdAt) &&
                    ` · ${formatRelativeTime(item.report.createdAt)}`}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink-soft">
                {formatDistance(distanceKm * 1000)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
