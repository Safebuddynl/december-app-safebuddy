import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronUp, Clock, X } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import PanicButton from "@/components/PanicButton";
import SafeMap, { type MapStyle } from "@/components/map/SafeMap";
import BottomSheet, { type SheetState } from "@/components/route/BottomSheet";
import FloatingSearch from "@/components/route/FloatingSearch";
import { HomeSheetPeek, NearbyReports } from "@/components/route/HomeSheetContent";
import MapTools from "@/components/route/MapTools";
import NavigationPanel from "@/components/route/NavigationPanel";
import ReportCard from "@/components/route/ReportCard";
import ReportHazardForm, { type HazardSubmission } from "@/components/route/ReportHazardForm";
import RouteModeToggle, { type RouteMode } from "@/components/route/RouteModeToggle";
import RouteWarningsDialog from "@/components/route/RouteWarningsDialog";
import { NavigationPeek, RouteOverviewPeek } from "@/components/route/RouteSheetContent";
import SafetyBreakdown from "@/components/route/SafetyBreakdown";
import ShareTripPanel from "@/components/route/ShareTripPanel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNavigation } from "@/hooks/useNavigation";
import { useNavigationView } from "@/hooks/useNavigationView";
import { useReports } from "@/hooks/useReports";
import { readSafetyPreferences } from "@/hooks/useSafetyPreferences";
import { useTripShare } from "@/hooks/useTripShare";
import { useLanguage } from "@/i18n/LanguageContext";
import type { LatLng, NamedLocation } from "@/lib/geo";
import {
  GeolocationUnavailableError,
  getCurrentLocation,
  type PlaceSuggestion,
} from "@/lib/geocoding";
import { DEFAULT_FILTERS, TIME_FILTERS, applyFilters } from "@/lib/reports/filters";
import { createSafetyReport, deleteSafetyReport, toggleReportLike } from "@/lib/reports/mutations";
import { nearestReports } from "@/lib/reports/nearby";
import { countBySeverity, type MappedReport, type SafetyReport } from "@/lib/reports/types";
import {
  RoutingError,
  planRoutes,
  rescoreWithLighting,
  type RouteOptions,
  type TravelMode,
} from "@/lib/routing/directions";
import { explainRoute } from "@/lib/safety/explain";
import { fetchLightingCoverage } from "@/lib/safety/lighting";
import { cn } from "@/lib/utils";

/**
 * The map screen: plan a route, see reported problem spots, report one, and
 * navigate.
 *
 * The map is the whole interface; everything else floats over it. This page
 * wires things together. The map itself lives in `SafeMap`, route planning in
 * `lib/routing`, and report loading in `useReports`.
 */

/** Amsterdam, used until the user's own position or a search moves the map. */
const DEFAULT_CENTER: [number, number] = [52.3676, 4.9041];
const DEFAULT_ZOOM = 12;
const FOCUS_ZOOM = 15;
const REPORT_ZOOM = 17;

/** Height reserved for the bottom navigation bar. */
const BOTTOM_NAV_SPACE = 80;
/** Gap between floating buttons and whatever is below them. */
const FLOATING_GAP = 12;

const NEARBY_RADIUS_KM = 1;
const NEARBY_LIMIT = 25;

/** What the bottom sheet is showing. Earlier entries take priority. */
type SheetMode = "navigation" | "compose" | "detail" | "route" | "home";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2";

const Route = () => {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const { mapped, patchReport, removeReport, addReport } = useReports();

  const [startText, setStartText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [start, setStart] = useState<NamedLocation | null>(null);
  const [destination, setDestination] = useState<NamedLocation | null>(null);

  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  // Where the user has panned to: biases address suggestions and decides which
  // reports count as nearby.
  const [viewCenter, setViewCenter] = useState<LatLng>({
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
  });
  const [isDark, setIsDark] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>("navigation");

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedReport, setSelectedReport] = useState<SafetyReport | null>(null);

  const [travelMode, setTravelMode] = useState<TravelMode>("foot");
  const [routeOptions, setRouteOptions] = useState<RouteOptions | null>(null);
  // Starts on the default chosen in the profile's safety preferences.
  const [routeMode, setRouteMode] = useState<RouteMode>(
    () => readSafetyPreferences().defaultRouteMode
  );
  const [isPlanning, setIsPlanning] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);

  const [isComposing, setIsComposing] = useState(false);
  const [composePoint, setComposePoint] = useState<LatLng | null>(null);
  const [isLocatingReport, setIsLocatingReport] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);

  const [sheetState, setSheetState] = useState<SheetState>("peek");
  const [sheetInset, setSheetInset] = useState(0);

  // The planner returns both routes; the toggle only chooses which one shows.
  const route = routeOptions
    ? routeMode === "safe"
      ? routeOptions.safest
      : routeOptions.fastest
    : null;
  const routeModeRef = useRef(routeMode);
  routeModeRef.current = routeMode;

  // Identifies the most recent plan, so a slow response cannot overwrite the
  // results of a newer search.
  const planIdRef = useRef(0);

  // The map follows the user itself while navigating.
  const navigation = useNavigation();
  const isNavigating = navigation.isNavigating && route !== null;
  const navView = useNavigationView(
    route,
    navigation.position,
    navigation.heading,
    navigation.isNavigating
  );

  // Deelt de positie die navigatie doorgeeft, of anders het gekozen startpunt.
  const tripShare = useTripShare(navigation.position ?? start);

  const visibleReports = useMemo(() => applyFilters(mapped, filters), [mapped, filters]);
  const counts = useMemo(() => countBySeverity(visibleReports), [visibleReports]);
  const nearby = useMemo(
    () => nearestReports(visibleReports, viewCenter, NEARBY_RADIUS_KM, NEARBY_LIMIT),
    [visibleReports, viewCenter]
  );

  // --- Route planning ------------------------------------------------------

  const planRoute = useCallback(
    async (
      mode: TravelMode,
      from: NamedLocation | null = start,
      to: NamedLocation | null = destination
    ) => {
      if (!from || !to) {
        toast.error("Kies eerst een start en een bestemming uit de suggesties");
        return;
      }

      const planId = ++planIdRef.current;
      setIsPlanning(true);
      setRouteError(null);

      try {
        const options = await planRoutes(from, to, mode, mapped);
        if (planIdRef.current !== planId) return;

        setRouteOptions(options);
        setSheetState("peek");
        const shown = routeModeRef.current === "safe" ? options.safest : options.fastest;
        setShowWarnings(shown.safety.warnings.length > 0);
        toast.success("Route berekend");

        // Lighting is deliberately not awaited: OpenStreetMap can take many
        // seconds, and the route is more useful on screen now than a few
        // seconds later with one more factor folded in.
        void enrichWithLighting(options, planId);
      } catch (error) {
        if (planIdRef.current !== planId) return;
        const message =
          error instanceof RoutingError ? error.message : "Route kon niet worden berekend";
        setRouteError(message);
        toast.error(message);
      } finally {
        if (planIdRef.current === planId) setIsPlanning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start, destination, mapped]
  );

  /**
   * Fetch street lighting for both routes in the background and re-score once
   * it lands. A failure here is normal and simply leaves lighting out.
   */
  const enrichWithLighting = useCallback(
    async (options: RouteOptions, planId: number) => {
      const sameRoute = options.safest === options.fastest;
      const [safeLighting, fastLighting] = await Promise.all([
        fetchLightingCoverage(options.safest.coordinates),
        sameRoute ? Promise.resolve(null) : fetchLightingCoverage(options.fastest.coordinates),
      ]);
      if (planIdRef.current !== planId) return;

      const safest = safeLighting
        ? rescoreWithLighting(options.safest, mapped, safeLighting)
        : options.safest;
      const fastest = sameRoute
        ? safest
        : fastLighting
          ? rescoreWithLighting(options.fastest, mapped, fastLighting)
          : options.fastest;

      if (safest !== options.safest || fastest !== options.fastest) {
        setRouteOptions({ safest, fastest });
      }
    },
    [mapped]
  );

  // Written from the computed factors, so it updates in step with the score.
  const explanation = useMemo(
    () =>
      route
        ? explainRoute({
            safety: route.safety,
            distanceLabel: route.distanceLabel,
            durationLabel: route.durationLabel,
            travelMode,
          })
        : null,
    [route, travelMode]
  );

  // Recalculate when the travel mode changes, but only once a route exists.
  const hasRoute = routeOptions !== null;
  useEffect(() => {
    if (hasRoute) void planRoute(travelMode);
    // `planRoute` changes with its inputs; re-running on those would replan
    // on every keystroke instead of only on a mode switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelMode]);

  const chooseDestination = async (suggestion: PlaceSuggestion) => {
    const target = { lat: suggestion.lat, lng: suggestion.lng, name: suggestion.label };
    setDestination(target);
    setDestinationText(suggestion.label);
    setCenter([target.lat, target.lng]);
    setZoom(FOCUS_ZOOM);

    // Without a chosen start, "Van: Mijn locatie" means the user's position.
    let from = start;
    if (!from) {
      const toastId = toast.loading("Locatie ophalen...");
      try {
        from = await getCurrentLocation();
        setStart(from);
        setStartText(from.name);
        toast.dismiss(toastId);
      } catch (error) {
        toast.error(describeLocationError(error), {
          id: toastId,
          description: "Kies zelf een startpunt bij 'Van'.",
        });
        return;
      }
    }

    void planRoute(travelMode, from, target);
  };

  const chooseStart = (suggestion: PlaceSuggestion) => {
    const from = { lat: suggestion.lat, lng: suggestion.lng, name: suggestion.label };
    setStart(from);
    setStartText(suggestion.label);
    if (destination) {
      void planRoute(travelMode, from, destination);
    } else {
      setCenter([from.lat, from.lng]);
      setZoom(FOCUS_ZOOM);
    }
  };

  const locateStart = async () => {
    const toastId = toast.loading("Locatie ophalen...");
    try {
      const location = await getCurrentLocation();
      setStart(location);
      setStartText(location.name);
      toast.success("Locatie gevonden", { id: toastId });
      if (destination) void planRoute(travelMode, location, destination);
      else {
        setCenter([location.lat, location.lng]);
        setZoom(FOCUS_ZOOM);
      }
    } catch (error) {
      toast.error(describeLocationError(error), { id: toastId });
    }
  };

  const clearDestination = () => {
    planIdRef.current++;
    setIsPlanning(false);
    setDestination(null);
    setDestinationText("");
    setRouteOptions(null);
    setRouteError(null);
  };

  // --- Reports -------------------------------------------------------------

  const focusReport = (item: MappedReport) => {
    setSelectedReport(item.report);
    setCenter([item.lat, item.lng]);
    setZoom(REPORT_ZOOM);
  };

  const handleLike = async (report: SafetyReport) => {
    try {
      const { liked, upvotes } = await toggleReportLike(report.id);
      patchReport(report.id, { upvotes });
      setSelectedReport((current) =>
        current && current.id === report.id ? { ...current, upvotes } : current
      );
      toast.success(liked ? "Melding geliket" : "Like verwijderd");
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "not-authenticated"
          ? "Log in om te liken"
          : "Kon de like niet opslaan"
      );
    }
  };

  const handleDelete = async (report: SafetyReport) => {
    try {
      await deleteSafetyReport(report.id);
      removeReport(report.id);
      setSelectedReport(null);
      toast.success("Melding verwijderd");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      toast.error(
        reason === "not-authenticated"
          ? "Log in om te verwijderen"
          : reason === "not-owner"
            ? "Je kunt alleen je eigen meldingen verwijderen"
            : "Kon de melding niet verwijderen"
      );
    }
  };

  const startCompose = (point: LatLng | null = null) => {
    setSelectedReport(null);
    setShowSharePanel(false);
    setComposePoint(point);
    setIsComposing(true);
  };

  const cancelCompose = () => {
    setIsComposing(false);
    setComposePoint(null);
  };

  // Without a long-press, the report goes where the map is centred.
  const reportPoint = composePoint ?? viewCenter;

  const locateReport = async () => {
    setIsLocatingReport(true);
    try {
      const location = await getCurrentLocation();
      setComposePoint({ lat: location.lat, lng: location.lng });
      setCenter([location.lat, location.lng]);
      setZoom(REPORT_ZOOM);
    } catch (error) {
      toast.error(describeLocationError(error));
    } finally {
      setIsLocatingReport(false);
    }
  };

  const submitHazard = async (submission: HazardSubmission): Promise<boolean> => {
    try {
      const report = await createSafetyReport({
        point: submission.point,
        address: submission.address,
        reportType: submission.reportType,
        severity: submission.severity,
        description: submission.description,
      });
      addReport(report);
      // Profile listens for this to update its report count.
      window.dispatchEvent(new Event("reportSubmitted"));
      setIsComposing(false);
      setComposePoint(null);
      toast.success("Gevaar gemeld", { description: "Dank je. Je melding staat nu op de kaart." });
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "not-authenticated"
          ? "Log in om een melding te maken"
          : "Melding opslaan mislukt. Probeer het opnieuw."
      );
      return false;
    }
  };

  // --- Trip sharing --------------------------------------------------------

  const handleStartSharing = async (expectedArrival: Date | null, contactIds: string[]) => {
    try {
      await tripShare.start({
        destinationAddress: destination?.name,
        destination: destination ?? undefined,
        expectedArrival: expectedArrival ?? undefined,
        contactIds,
      });
      toast.success(
        expectedArrival
          ? "Je rit wordt gedeeld. Meld je op tijd af."
          : "Je rit wordt gedeeld. Stuur de link naar je contact."
      );
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "not-authenticated"
          ? "Log in om je rit te delen"
          : "Delen kon niet worden gestart"
      );
    }
  };

  const handleStopSharing = async () => {
    try {
      await tripShare.stop();
      toast.success("Delen gestopt. De link werkt niet meer.");
    } catch {
      toast.error("Kon het delen niet stoppen");
    }
  };

  const handleCheckIn = async () => {
    try {
      await tripShare.checkIn();
      toast.success("Afgemeld. Je contacten worden niet gewaarschuwd.");
    } catch {
      toast.error("Afmelden mislukt. Probeer het opnieuw.");
    }
  };

  const handleExtend = async (extraMinutes: number) => {
    try {
      await tripShare.extend(extraMinutes);
      toast.success(`Check-in met ${extraMinutes} minuten verlengd`);
    } catch {
      toast.error("Verlengen mislukt");
    }
  };

  // --- Navigation ----------------------------------------------------------

  const startNavigation = () => {
    if (!route) return;
    try {
      navigation.start(route);
      toast.success(`Navigatie gestart naar ${destination?.name ?? "bestemming"}`);
    } catch {
      toast.error("GPS is niet beschikbaar op dit apparaat");
    }
  };

  const stopNavigation = () => {
    navigation.stop();
    toast.info("Navigatie gestopt");
  };

  // --- Bottom sheet --------------------------------------------------------

  const sheetMode: SheetMode = isNavigating
    ? "navigation"
    : isComposing
      ? "compose"
      : selectedReport
        ? "detail"
        : route
          ? "route"
          : "home";

  // Each mode opens at its natural height.
  useEffect(() => {
    setSheetState(sheetMode === "compose" ? "expanded" : "peek");
  }, [sheetMode]);

  const handleSheetStateChange = (next: SheetState) => {
    if (next === "hidden" && sheetMode === "compose") return cancelCompose();
    if (next === "hidden" && sheetMode === "detail") return setSelectedReport(null);
    setSheetState(next);
  };

  const sharePanel = (
    <ShareTripPanel
      trip={tripShare.trip}
      isBusy={tripShare.isBusy}
      destinationAddress={destination?.name ?? null}
      onStart={handleStartSharing}
      onStop={handleStopSharing}
      onCheckIn={handleCheckIn}
      onExtend={handleExtend}
      embedded
    />
  );

  const sheet = ((): {
    label: string;
    canHide: boolean;
    withHalf?: boolean;
    peek: React.ReactNode;
    content?: React.ReactNode;
  } | null => {
    switch (sheetMode) {
      case "navigation":
        if (!route || !navView) return null;
        return {
          label: "Navigatie",
          canHide: false,
          peek: (
            <NavigationPeek
              arrival={navView.arrival}
              remainingSeconds={navView.remainingSeconds}
              remainingMeters={navView.remainingMeters}
              score={route.safety.score}
              onStop={stopNavigation}
            />
          ),
          content: (
            <div className="space-y-4">
              {sharePanel}
              <SafetyBreakdown safety={route.safety} explanation={explanation} embedded />
            </div>
          ),
        };

      case "compose":
        return {
          label: "Gevaar melden",
          canHide: true,
          peek: (
            <div className="flex items-center gap-3 px-4 pb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-ink">Meld een gevaarlijke plek</p>
                <p className="truncate text-xs text-ink-soft">
                  Verschuif de kaart of houd een plek ingedrukt
                </p>
              </div>
              <button
                type="button"
                onClick={cancelCompose}
                aria-label="Melding annuleren"
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tint text-ink-soft hover:text-ink",
                  focusRing
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ),
          content: (
            <ReportHazardForm
              point={reportPoint}
              onUseMyLocation={() => void locateReport()}
              isLocating={isLocatingReport}
              onSubmit={submitHazard}
              onCancel={cancelCompose}
              isLoggedIn={Boolean(user)}
            />
          ),
        };

      case "detail":
        if (!selectedReport) return null;
        return {
          label: "Melding",
          canHide: true,
          peek: (
            <div className="px-4 pb-4">
              <ReportCard
                report={selectedReport}
                currentUserId={user?.id ?? null}
                onClose={() => setSelectedReport(null)}
                onLike={handleLike}
                onDelete={handleDelete}
                embedded
              />
            </div>
          ),
        };

      case "route":
        if (!route) return null;
        return {
          label: "Route",
          canHide: true,
          peek: (
            <RouteOverviewPeek
              route={route}
              onStart={startNavigation}
              onHide={() => setSheetState("hidden")}
            />
          ),
          content: (
            <div className="space-y-4">
              <SafetyBreakdown safety={route.safety} explanation={explanation} embedded />
              {sharePanel}
            </div>
          ),
        };

      case "home":
        return {
          label: "SafeBuddy",
          canHide: false,
          withHalf: true,
          peek: (
            <HomeSheetPeek
              onReport={() => startCompose()}
              onShare={() => {
                setShowSharePanel(true);
                setSheetState("half");
              }}
              isSharing={tripShare.isSharing}
            />
          ),
          content: (
            <div className="space-y-4">
              {(showSharePanel || tripShare.isSharing) && sharePanel}
              <NearbyReports
                items={nearby}
                radiusLabel={`${NEARBY_RADIUS_KM} km`}
                onSelect={focusReport}
              />
            </div>
          ),
        };
    }
  })();

  // Everything floating is positioned from the bottom of the visible map.
  const baseOffset = isNavigating ? 0 : BOTTOM_NAV_SPACE;
  const mapInset = sheet ? sheetInset : 0;
  const floatingBottom = baseOffset + mapInset + FLOATING_GAP;

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* No z-index here: the recenter button inside must stack with the page overlays. */}
      <div className={`absolute inset-x-0 top-0 ${isNavigating ? "bottom-0" : "bottom-20"}`}>
        <SafeMap
          reports={visibleReports}
          start={start}
          destination={destination}
          routeCoordinates={route?.coordinates ?? null}
          routeKind={routeMode}
          userPosition={navigation.position}
          center={center}
          zoom={zoom}
          isDark={isDark}
          mapStyle={mapStyle}
          navigationCamera={
            navView ? { target: navView.cameraTarget, bearing: navView.bearing } : null
          }
          routeProgress={navView?.progress ?? 0}
          bottomInset={mapInset}
          pendingPoint={isComposing ? reportPoint : null}
          onLongPress={isNavigating ? undefined : (point) => startCompose(point)}
          onPointClick={(item) => {
            if (isComposing) return;
            setSelectedReport(item.report);
          }}
          onMapMove={(viewport) => setViewCenter(viewport.center)}
        />
      </div>

      {/* Search, route mode and map tools, floating over the map. */}
      {!isNavigating && !isComposing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-col gap-2 sm:right-auto sm:w-[26rem]">
          <FloatingSearch
            destinationText={destinationText}
            onDestinationTextChange={setDestinationText}
            onDestinationSelect={(suggestion) => void chooseDestination(suggestion)}
            onClearDestination={clearDestination}
            startText={startText}
            onStartTextChange={setStartText}
            onStartSelect={chooseStart}
            startLabel={start?.name ?? null}
            onUseMyLocation={() => void locateStart()}
            travelMode={travelMode}
            onTravelModeChange={setTravelMode}
            isPlanning={isPlanning}
            canPlan={Boolean(start && destination && !routeOptions)}
            onPlan={() => void planRoute(travelMode)}
            near={viewCenter}
          />

          <div className="flex items-center justify-between gap-2">
            <RouteModeToggle
              value={routeMode}
              onChange={setRouteMode}
              safeDetail={routeOptions?.safest.durationLabel}
              fastDetail={routeOptions?.fastest.durationLabel}
            />
            <MapTools
              filtersOpen={showFilters}
              onToggleFilters={() => setShowFilters((open) => !open)}
              isDark={isDark}
              onToggleDark={() => setIsDark((dark) => !dark)}
              mapStyle={mapStyle}
              onToggleStyle={() =>
                setMapStyle((style) => (style === "satellite" ? "navigation" : "satellite"))
              }
            />
          </div>

          {showFilters && (
            <div className="glass pointer-events-auto rounded-panel p-3 text-ink shadow-float">
              <div className="mb-2 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                <span className="text-xs font-medium text-ink-soft">Periode</span>
              </div>
              <div role="radiogroup" aria-label="Periode" className="mb-3 grid grid-cols-5 gap-1.5">
                {TIME_FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={filters.time === value}
                    onClick={() => setFilters((current) => ({ ...current, time: value }))}
                    className={cn(
                      "rounded-full px-2 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none",
                      filters.time === value
                        ? "bg-brand text-white"
                        : "bg-tint text-ink-soft hover:text-ink",
                      focusRing
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-around border-t border-line pt-2 text-center">
                <div>
                  <span className="text-sm font-bold text-destructive">{counts.high}</span>
                  <span className="block text-xs text-ink-soft">{t("highRisk")}</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-warning">{counts.medium}</span>
                  <span className="block text-xs text-ink-soft">{t("mediumRisk")}</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-success">{counts.low}</span>
                  <span className="block text-xs text-ink-soft">{t("lowRisk")}</span>
                </div>
              </div>
            </div>
          )}

          {routeError && (
            <div
              role="alert"
              className="glass pointer-events-auto rounded-panel px-3 py-2 text-xs text-ink shadow-float"
            >
              {routeError}
            </div>
          )}
        </div>
      )}

      {isComposing && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] sm:right-auto sm:w-[26rem]">
          <div className="glass rounded-panel px-4 py-3 text-sm text-ink-soft shadow-float">
            Verschuif de kaart of houd een plek ingedrukt om de melding te plaatsen.
          </div>
        </div>
      )}

      {isNavigating && route && (
        <div
          className="absolute left-3 right-3 top-3 z-[2000] sm:right-auto sm:w-96"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <NavigationPanel
            route={route}
            stepIndex={navigation.stepIndex}
            metersToNextTurn={navigation.metersToNextTurn}
            isOffRoute={navigation.isOffRoute}
          />
        </div>
      )}

      {sheet && (
        <BottomSheet
          key={sheetMode}
          label={sheet.label}
          state={sheetState}
          onStateChange={handleSheetStateChange}
          canHide={sheet.canHide}
          withHalf={sheet.withHalf}
          onVisibleHeightChange={setSheetInset}
          className={isNavigating ? "bottom-0 pb-safe" : "bottom-20"}
          peek={sheet.peek}
        >
          {sheet.content}
        </BottomSheet>
      )}

      {sheetMode === "route" && route && sheetState === "hidden" && (
        <button
          type="button"
          onClick={() => setSheetState("peek")}
          className={cn(
            "absolute bottom-24 left-1/2 z-[2000] flex h-11 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink shadow-float glass",
            focusRing
          )}
        >
          <ChevronUp className="h-4 w-4" />
          Route · {route.durationLabel}
        </button>
      )}

      {showWarnings && route && (
        <RouteWarningsDialog
          warnings={route.safety.warnings}
          totalWarnings={route.safety.totalWarnings}
          safetyScore={route.safety.score}
          onDismiss={() => setShowWarnings(false)}
        />
      )}

      {/* Boven de bottom-nav, en boven het paneel. Eigen hoek, altijd bereikbaar. */}
      <div
        className="absolute right-[10px] z-[2500] transition-[bottom] duration-300 motion-reduce:transition-none"
        style={{ bottom: floatingBottom }}
      >
        <PanicButton position={navigation.position ?? start} />
      </div>

      {!isNavigating && <BottomNav />}
    </div>
  );
};

/** Turn a geolocation failure into something worth showing the user. */
function describeLocationError(error: unknown): string {
  if (error instanceof GeolocationUnavailableError) {
    return error.message === "insecure-context"
      ? "Locatie werkt alleen via https"
      : "Deze browser ondersteunt geen locatie";
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    switch ((error as GeolocationPositionError).code) {
      case 1:
        return "Locatie geweigerd. Sta locatie toe in je browserinstellingen.";
      case 2:
        return "GPS is niet beschikbaar. Zet locatie aan en probeer opnieuw.";
      case 3:
        return "Locatie ophalen duurde te lang. Probeer opnieuw.";
    }
  }

  return "Kon je locatie niet ophalen";
}

export default Route;
