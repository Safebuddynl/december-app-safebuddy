import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Clock,
  Inbox,
  Loader2,
  LocateFixed,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BottomNav from "@/components/BottomNav";
import ReportLocationDialog from "@/components/ReportLocationDialog";
import CommunityReportCard from "@/components/community/CommunityReportCard";
import { FeedEmptyState, ReportCardSkeleton } from "@/components/community/FeedStates";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useReports } from "@/hooks/useReports";
import type { LatLng } from "@/lib/geo";
import { FEED_SORT_OPTIONS, buildFeed, type FeedSort } from "@/lib/reports/feed";
import {
  DEFAULT_FILTERS,
  TIME_FILTERS,
  applyFilters,
  type SeverityFilter,
  type TimeFilter,
} from "@/lib/reports/filters";
import { fetchLikedReportIds } from "@/lib/reports/likes";
import { canDelete, canLike, deleteSafetyReport, toggleReportLike } from "@/lib/reports/mutations";
import { TYPE_FILTER_OPTIONS } from "@/lib/reports/reportTypes";
import { countBySeverity, type SafetyReport } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

/**
 * The community feed: every report, with search, filters, sorting and an
 * "in de buurt" mode. Reports come from the same loader the map uses; all
 * filtering happens on that loaded list.
 */

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "Alles" },
  { value: "high", label: "Hoog" },
  { value: "medium", label: "Matig" },
  { value: "low", label: "Laag" },
];

/**
 * How many cards to render at once.
 *
 * The feed holds roughly 15.000 reports. Rendering them all would put tens of
 * thousands of nodes in the DOM and lock the page up for seconds, so the list
 * grows on demand instead. Every report stays reachable.
 */
const PAGE_SIZE = 50;

const SKELETON_COUNT = 5;
const SEARCH_DEBOUNCE_MS = 300;
const NEARBY_RADIUS_KM = 2;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const chipClass = (active: boolean) =>
  cn(
    "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium shadow-card transition-colors motion-reduce:transition-none",
    focusRing,
    active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-primary"
  );

const selectTriggerClass = cn(
  "h-9 w-auto shrink-0 gap-1.5 whitespace-nowrap rounded-full border-0 bg-card px-3.5 text-sm font-medium shadow-card",
  "focus:ring-2 focus:ring-ring focus:ring-offset-2"
);

const Community = () => {
  const { user } = useCurrentUser();
  const { reports, isLoading, error, refresh, patchReport, removeReport } = useReports();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchText, setSearchText] = useState("");
  const search = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS);
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<FeedSort>("newest");
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [isNearby, setIsNearby] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const [renderCount, setRenderCount] = useState(PAGE_SIZE);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<SafetyReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const counts = useMemo(
    () => countBySeverity(reports.map((report) => ({ report }))),
    [reports]
  );

  const feed = useMemo(
    () =>
      buildFeed(applyFilters(reports, filters), {
        search,
        types,
        sort,
        origin,
        radiusKm: isNearby ? NEARBY_RADIUS_KM : null,
      }),
    [reports, filters, search, types, sort, origin, isNearby]
  );

  // Start again from the top whenever the result changes shape, so a narrower
  // filter does not leave the reader scrolled into a list that no longer exists.
  useEffect(
    () => setRenderCount(PAGE_SIZE),
    [filters, search, types, sort, origin, isNearby]
  );

  // Which reports this user already liked, so their buttons start filled.
  useEffect(() => {
    if (!user) {
      setLikedIds(new Set());
      return;
    }
    let active = true;
    fetchLikedReportIds().then((ids) => active && setLikedIds(ids));
    return () => {
      active = false;
    };
  }, [user]);

  const visible = useMemo(() => feed.slice(0, renderCount), [feed, renderCount]);
  const hasMore = renderCount < feed.length;
  const showDistance = origin !== null && (isNearby || sort === "nearest");

  const hasActiveFilters =
    filters.time !== "all" ||
    filters.severity !== "all" ||
    types.size > 0 ||
    searchText.trim() !== "" ||
    isNearby;

  // --- Location --------------------------------------------------------------

  /** Ask for the position, or reuse the one we have. */
  const ensureOrigin = async (fresh: boolean): Promise<LatLng | null> => {
    if (origin && !fresh) return origin;
    setIsLocating(true);
    try {
      const position = await readDevicePosition();
      setOrigin(position);
      return position;
    } catch (cause) {
      toast.error(describeLocationError(cause));
      return null;
    } finally {
      setIsLocating(false);
    }
  };

  const toggleNearby = async () => {
    if (isNearby) {
      setIsNearby(false);
      return;
    }
    const position = await ensureOrigin(true);
    if (!position) return;
    setIsNearby(true);
    setSort("nearest");
  };

  const changeSort = async (next: FeedSort) => {
    if (next !== "nearest") {
      setSort(next);
      return;
    }
    if (await ensureOrigin(false)) setSort("nearest");
  };

  const toggleType = (key: string) =>
    setTypes((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setTypes(new Set());
    setSearchText("");
    setIsNearby(false);
    setSort("newest");
  };

  // --- Writes (unchanged logic) -----------------------------------------------

  const handleLike = async (report: SafetyReport) => {
    try {
      const { liked, upvotes } = await toggleReportLike(report.id);
      patchReport(report.id, { upvotes });
      setLikedIds((current) => {
        const next = new Set(current);
        if (liked) next.add(report.id);
        else next.delete(report.id);
        return next;
      });
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    await handleDelete(pendingDelete);
    setIsDeleting(false);
    setPendingDelete(null);
  };

  // --- Render ------------------------------------------------------------------

  const newReportButton = (
    <Button onClick={() => setIsDialogOpen(true)} className="rounded-full">
      <Plus className="h-4 w-4" />
      Nieuwe melding
    </Button>
  );

  const emptyState = isNearby
    ? {
        Icon: LocateFixed,
        title: `Geen meldingen binnen ${NEARBY_RADIUS_KM} km`,
        description: "Zet 'In de buurt' uit of pas de filters aan.",
      }
    : search.trim()
      ? {
          Icon: SearchX,
          title: `Niets gevonden voor "${search.trim()}"`,
          description: "Probeer een ander adres, soort of woord.",
        }
      : {
          Icon: Inbox,
          title: "Nog geen meldingen in deze categorie",
          description: "Pas de filters aan, of meld zelf een onveilige plek.",
        };

  const formatCount = (value: number) => (isLoading ? "–" : value.toLocaleString("nl-NL"));

  return (
    <div className="min-h-screen overflow-y-auto bg-background pb-24">
      <header className="gradient-header px-4 pb-12 pt-10 text-primary-foreground">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold">Meldingen</h1>
          <p className="mt-1 text-sm text-primary-foreground/80">
            Deel en bekijk veiligheidsmeldingen
          </p>

          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Aantal meldingen">
            <StatBadge label="Totaal" value={formatCount(reports.length)} />
            <StatBadge label="Hoog" value={formatCount(counts.high)} dotClass="bg-destructive" />
            <StatBadge label="Matig" value={formatCount(counts.medium)} dotClass="bg-warning" />
            <StatBadge label="Laag" value={formatCount(counts.low)} dotClass="bg-success" />
          </ul>
        </div>
      </header>

      <main className="mx-auto -mt-7 max-w-2xl px-4">
        <Button
          onClick={() => setIsDialogOpen(true)}
          className="mb-2 h-12 w-full rounded-2xl text-base font-semibold shadow-elevated"
        >
          <Plus className="h-5 w-5" />
          Nieuwe melding
        </Button>

        {/* Search and filters stay reachable while scrolling through the feed. */}
        <div className="sticky top-0 z-30 -mx-4 mb-3 space-y-2.5 bg-background/95 px-4 pb-3 pt-3 backdrop-blur-md">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Zoek op adres, soort of beschrijving"
              aria-label="Zoek meldingen"
              className="h-11 rounded-full border-0 bg-card pl-10 pr-10 shadow-card [&::-webkit-search-cancel-button]:hidden"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText("")}
                aria-label="Zoekopdracht wissen"
                className={cn(
                  "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted",
                  focusRing
                )}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <ChipScroller label="Weergave">
            <button
              type="button"
              onClick={() => void toggleNearby()}
              aria-pressed={isNearby}
              disabled={isLocating}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium shadow-card transition-colors motion-reduce:transition-none disabled:opacity-70",
                focusRing,
                isNearby
                  ? "bg-info text-info-foreground"
                  : "bg-card text-muted-foreground hover:text-info"
              )}
            >
              {isLocating ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <LocateFixed className="h-4 w-4" aria-hidden="true" />
              )}
              In de buurt{isNearby && ` · ${NEARBY_RADIUS_KM} km`}
            </button>

            <Select value={sort} onValueChange={(value) => void changeSort(value as FeedSort)}>
              <SelectTrigger aria-label="Sorteren" className={selectTriggerClass}>
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEED_SORT_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.time}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, time: value as TimeFilter }))
              }
            >
              <SelectTrigger aria-label="Periode" className={selectTriggerClass}>
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_FILTERS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {value === "all" ? "Alle periodes" : label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span aria-hidden="true" className="mx-0.5 w-px shrink-0 self-stretch bg-border" />

            <div role="radiogroup" aria-label="Ernst" className="flex gap-2">
              {SEVERITY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={filters.severity === value}
                  onClick={() => setFilters((current) => ({ ...current, severity: value }))}
                  className={chipClass(filters.severity === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </ChipScroller>

          <ChipScroller label="Soort melding">
            <button
              type="button"
              onClick={() => setTypes(new Set())}
              aria-pressed={types.size === 0}
              className={chipClass(types.size === 0)}
            >
              Alle soorten
            </button>
            {TYPE_FILTER_OPTIONS.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleType(value)}
                aria-pressed={types.has(value)}
                className={chipClass(types.has(value))}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </ChipScroller>
        </div>

        {!isLoading && !error && feed.length > 0 && (
          <div className="mb-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <p aria-live="polite">
              {feed.length === reports.length
                ? `${reports.length.toLocaleString("nl-NL")} meldingen`
                : `${feed.length.toLocaleString("nl-NL")} van ${reports.length.toLocaleString("nl-NL")} meldingen`}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className={cn("rounded font-medium text-primary", focusRing)}
              >
                Filters wissen
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {isLoading && (
            <div role="status" aria-label="Meldingen laden" className="space-y-3">
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <ReportCardSkeleton key={index} />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <FeedEmptyState
              Icon={AlertTriangle}
              title="Meldingen konden niet worden geladen"
              description="Controleer je verbinding en probeer het opnieuw."
              action={
                <Button variant="outline" onClick={() => void refresh()} className="rounded-full">
                  <RefreshCw className="h-4 w-4" />
                  Opnieuw proberen
                </Button>
              }
            />
          )}

          {!isLoading && !error && feed.length === 0 && (
            <FeedEmptyState
              Icon={emptyState.Icon}
              title={emptyState.title}
              description={emptyState.description}
              action={
                hasActiveFilters ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={clearFilters} className="rounded-full">
                      Filters wissen
                    </Button>
                    {newReportButton}
                  </div>
                ) : (
                  newReportButton
                )
              }
            />
          )}

          {visible.map(({ report, distanceKm }) => (
            <CommunityReportCard
              key={report.id}
              report={report}
              isLiked={likedIds.has(report.id)}
              canLike={canLike(report)}
              canDelete={canDelete(report, user?.id ?? null)}
              distanceKm={showDistance ? distanceKm : null}
              onLike={(item) => void handleLike(item)}
              onDelete={setPendingDelete}
            />
          ))}

          {hasMore && (
            <Button
              variant="outline"
              className="h-11 w-full rounded-2xl"
              onClick={() => setRenderCount((count) => count + PAGE_SIZE)}
            >
              Meer laden ({(feed.length - renderCount).toLocaleString("nl-NL")} resterend)
            </Button>
          )}
        </div>
      </main>

      <ReportLocationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onReportSubmitted={refresh}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null);
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Melding verwijderen?</DialogTitle>
            <DialogDescription>
              Dit kan niet ongedaan worden gemaakt. De likes op deze melding verdwijnen ook.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={isDeleting}
              className="rounded-xl"
            >
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={isDeleting}
              className="rounded-xl"
            >
              {isDeleting ? "Verwijderen…" : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

const StatBadge = ({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: string;
  dotClass?: string;
}) => (
  <li className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium backdrop-blur-sm">
    {dotClass && <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", dotClass)} />}
    <span className="tabular-nums font-semibold">{value}</span>
    <span className="text-primary-foreground/80">{label}</span>
  </li>
);

/** A horizontally scrolling row of chips that bleeds to the screen edges. */
const ChipScroller = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div
    role="group"
    aria-label={label}
    className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {children}
  </div>
);

/** The device position, without the address lookup `getCurrentLocation` does. */
function readDevicePosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
    );
  });
}

function describeLocationError(error: unknown): string {
  if (error instanceof Error && error.message === "unsupported") {
    return "Deze browser ondersteunt geen locatie";
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    switch ((error as GeolocationPositionError).code) {
      case 1:
        return "Locatie geweigerd. Sta locatie toe in je browserinstellingen.";
      case 2:
        return "Locatie niet beschikbaar. Zet locatie aan en probeer opnieuw.";
      case 3:
        return "Locatie ophalen duurde te lang. Probeer opnieuw.";
    }
  }
  return "Kon je locatie niet ophalen";
}

export default Community;
