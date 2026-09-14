import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  Car,
  ChevronUp,
  Clock,
  Filter,
  Footprints,
  Locate,
  Map as MapIcon,
  Moon,
  Route as RouteIcon,
  Satellite,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import BottomNav from "@/components/BottomNav";
import PanicButton from "@/components/PanicButton";
import SafeMap, { type MapStyle } from "@/components/map/SafeMap";
import BottomSheet, { type SheetState } from "@/components/route/BottomSheet";
import LocationSearchInput from "@/components/route/LocationSearchInput";
import NavigationPanel from "@/components/route/NavigationPanel";
import ReportCard from "@/components/route/ReportCard";
import RouteWarningsDialog from "@/components/route/RouteWarningsDialog";
import { NavigationPeek, RouteOverviewPeek } from "@/components/route/RouteSheetContent";
import SafetyBreakdown from "@/components/route/SafetyBreakdown";
import ShareTripPanel from "@/components/route/ShareTripPanel";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNavigation } from "@/hooks/useNavigation";
import { useNavigationView } from "@/hooks/useNavigationView";
import { useReports } from "@/hooks/useReports";
import { useTripShare } from "@/hooks/useTripShare";
import { useLanguage } from "@/i18n/LanguageContext";
import type { LatLng, NamedLocation } from "@/lib/geo";
import { GeolocationUnavailableError, getCurrentLocation } from "@/lib/geocoding";
import { DEFAULT_FILTERS, TIME_FILTERS, applyFilters } from "@/lib/reports/filters";
import { deleteSafetyReport, toggleReportLike } from "@/lib/reports/mutations";
import { countBySeverity, type SafetyReport } from "@/lib/reports/types";
import {
  RoutingError,
  planRoutes,
  rescoreWithLighting,
  type PlannedRoute,
  type TravelMode,
} from "@/lib/routing/directions";
import { explainRoute } from "@/lib/safety/explain";
import { fetchLightingCoverage } from "@/lib/safety/lighting";

/**
 * The map screen: plan a route, see reported problem spots, and navigate.
 *
 * This page wires things together. The map itself lives in `SafeMap`,
 * route planning in `lib/routing`, and report loading in `useReports`.
 */

/** Amsterdam, used until the user's own position or a search moves the map. */
const DEFAULT_CENTER: [number, number] = [52.3676, 4.9041];
const DEFAULT_ZOOM = 12;
const FOCUS_ZOOM = 15;

/** Height reserved for the bottom navigation bar. */
const BOTTOM_NAV_SPACE = 80;
/** Gap between floating buttons and whatever is below them. */
const FLOATING_GAP = 12;

const TRAVEL_MODES: { value: TravelMode; Icon: typeof Footprints }[] = [
  { value: "foot", Icon: Footprints },
  { value: "bike", Icon: Bike },
  { value: "car", Icon: Car },
];

const Route = () => {
  const { t } = useLanguage();
  const { user } = useCurrentUser();
  const { mapped, patchReport, removeReport } = useReports();

  const [startText, setStartText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [start, setStart] = useState<NamedLocation | null>(null);
  const [destination, setDestination] = useState<NamedLocation | null>(null);

  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  // Where the user has panned to, used to bias address suggestions nearby.
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
  const [route, setRoute] = useState<PlannedRoute | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);

  const [sheetState, setSheetState] = useState<SheetState>("peek");
  const [sheetInset, setSheetInset] = useState(0);

  // Identifies the most recent plan, so a slow lighting response cannot
  // overwrite the results of a newer search.
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

  const planRoute = useCallback(
    async (mode: TravelMode) => {
      if (!start || !destination) {
        toast.error("Kies eerst een start en een bestemming uit de suggesties");
        return;
      }

      const planId = ++planIdRef.current;
      setIsPlanning(true);
      setRouteError(null);

      try {
        const { safest } = await planRoutes(start, destination, mode, mapped);
        if (planIdRef.current !== planId) return;

        setRoute(safest);
        setSheetState("peek");
        setShowWarnings(safest.safety.warnings.length > 0);
        toast.success("Route berekend");

        // Lighting is deliberately not awaited: OpenStreetMap can take many
        // seconds, and the route is more useful on screen now than a few
        // seconds later with one more factor folded in.
        void enrichWithLighting(safest, planId);
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
   * Fetch street lighting in the background and re-score once it lands.
   * A failure here is normal and simply leaves lighting out of the score.
   */
  const enrichWithLighting = useCallback(
    async (planned: PlannedRoute, planId: number) => {
      const lighting = await fetchLightingCoverage(planned.coordinates);
      if (!lighting || planIdRef.current !== planId) return;

      setRoute(rescoreWithLighting(planned, mapped, lighting));
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
  const hasRoute = route !== null;
  useEffect(() => {
    if (hasRoute) void planRoute(travelMode);
    // `planRoute` changes with its inputs; re-running on those would replan
    // on every keystroke instead of only on a mode switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelMode]);

  const useMyLocation = async () => {
    const toastId = toast.loading("Locatie ophalen...");
    try {
      const location = await getCurrentLocation();
      setStart(location);
      setStartText(location.name);
      setCenter([location.lat, location.lng]);
      setZoom(FOCUS_ZOOM);
      toast.success("Locatie gevonden", { id: toastId });
    } catch (error) {
      toast.error(describeLocationError(error), { id: toastId });
    }
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

  const startNavigation = () => {
    if (!route) return;
    try {
      navigation.start(route);
      setSheetState("peek");
      toast.success(`Navigatie gestart naar ${destination?.name ?? "bestemming"}`);
    } catch {
      toast.error("GPS is niet beschikbaar op dit apparaat");
    }
  };

  const stopNavigation = () => {
    navigation.stop();
    setSheetState("peek");
    toast.info("Navigatie gestopt");
  };

  // Everything floating is positioned from the bottom of the visible map.
  const baseOffset = isNavigating ? 0 : BOTTOM_NAV_SPACE;
  const mapInset = route ? sheetInset : 0;
  const floatingBottom = baseOffset + mapInset + FLOATING_GAP;

  const sharePanel = (embedded: boolean) => (
    <ShareTripPanel
      trip={tripShare.trip}
      isBusy={tripShare.isBusy}
      destinationAddress={destination?.name ?? null}
      onStart={handleStartSharing}
      onStop={handleStopSharing}
      onCheckIn={handleCheckIn}
      onExtend={handleExtend}
      embedded={embedded}
    />
  );

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* No z-index here: the recenter button inside must stack with the page overlays. */}
      <div className={`absolute inset-x-0 top-0 ${isNavigating ? "bottom-0" : "bottom-20"}`}>
        <SafeMap
          reports={visibleReports}
          start={start}
          destination={destination}
          routeCoordinates={route?.coordinates ?? null}
          routeKind="safe"
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
          onPointClick={(item) => setSelectedReport(item.report)}
          onMapMove={(viewport) => setViewCenter(viewport.center)}
        />
      </div>

      {/* Search and controls, floating over the map. Hidden while navigating. */}
      {!isNavigating && (
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-[1000]">
          <Card className="pointer-events-auto border-0 bg-background/95 shadow-lg backdrop-blur-sm">
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <LocationSearchInput
                  value={startText}
                  onValueChange={setStartText}
                  onSelect={(suggestion) => {
                    setStart({ lat: suggestion.lat, lng: suggestion.lng, name: suggestion.label });
                    setStartText(suggestion.label);
                    setCenter([suggestion.lat, suggestion.lng]);
                    setZoom(FOCUS_ZOOM);
                  }}
                  placeholder={t("enterStartLocation")}
                  near={viewCenter}
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={useMyLocation}
                      aria-label={t("myLocation")}
                      className="absolute right-1 top-1 h-8 w-8 p-0"
                    >
                      <Locate className="h-4 w-4" />
                    </Button>
                  }
                />

                <LocationSearchInput
                  value={destinationText}
                  onValueChange={setDestinationText}
                  onSelect={(suggestion) => {
                    setDestination({
                      lat: suggestion.lat,
                      lng: suggestion.lng,
                      name: suggestion.label,
                    });
                    setDestinationText(suggestion.label);
                    setCenter([suggestion.lat, suggestion.lng]);
                    setZoom(FOCUS_ZOOM);
                  }}
                  placeholder={t("enterEndLocation")}
                  near={viewCenter}
                />

                <Button
                  size="icon"
                  onClick={() => void planRoute(travelMode)}
                  disabled={isPlanning}
                  aria-label={t("findRoute")}
                  className="h-10 w-10 shrink-0"
                >
                  <RouteIcon className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {TRAVEL_MODES.map(({ value, Icon }) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={travelMode === value ? "default" : "ghost"}
                      onClick={() => setTravelMode(value)}
                      className="h-8 px-2"
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  ))}
                </div>

                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={showFilters ? "default" : "ghost"}
                    onClick={() => setShowFilters((open) => !open)}
                    className="h-8 w-8 p-0"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsDark((dark) => !dark)}
                    disabled={mapStyle === "satellite"}
                    className="h-8 w-8 p-0"
                  >
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="sm"
                    variant={mapStyle === "satellite" ? "default" : "ghost"}
                    onClick={() =>
                      setMapStyle((style) => (style === "satellite" ? "navigation" : "satellite"))
                    }
                    className="h-8 w-8 p-0"
                  >
                    {mapStyle === "satellite" ? (
                      <MapIcon className="h-4 w-4" />
                    ) : (
                      <Satellite className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {showFilters && (
            <Card className="pointer-events-auto mt-2 border-0 bg-background/95 shadow-lg backdrop-blur-sm">
              <CardContent className="p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="h-3 w-3 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Periode</span>
                </div>
                <div className="mb-3 grid grid-cols-5 gap-2">
                  {TIME_FILTERS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFilters((current) => ({ ...current, time: value }))}
                      className={`rounded px-2 py-2 text-xs font-medium transition-colors ${
                        filters.time === value
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-around border-t border-muted pt-2 text-center">
                  <div>
                    <span className="text-sm font-bold text-destructive">{counts.high}</span>
                    <span className="block text-xs text-muted-foreground">{t("highRisk")}</span>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-warning">{counts.medium}</span>
                    <span className="block text-xs text-muted-foreground">{t("mediumRisk")}</span>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-success">{counts.low}</span>
                    <span className="block text-xs text-muted-foreground">{t("lowRisk")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {routeError && (
            <Card className="pointer-events-auto mt-2 border-0 bg-destructive/10 shadow-lg">
              <CardContent className="p-2">
                <p className="text-xs text-destructive">{routeError}</p>
              </CardContent>
            </Card>
          )}

          {/* Without a route there is no sheet, so a running share shows here. */}
          {!route && tripShare.isSharing && (
            <div className="pointer-events-auto mt-2">{sharePanel(false)}</div>
          )}
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

      {route && (
        <BottomSheet
          key={isNavigating ? "navigation" : "overview"}
          label={isNavigating ? "Navigatie" : "Route"}
          state={isNavigating && sheetState === "hidden" ? "peek" : sheetState}
          onStateChange={setSheetState}
          canHide={!isNavigating}
          onVisibleHeightChange={setSheetInset}
          className={isNavigating ? "bottom-0 pb-safe" : "bottom-20"}
          peek={
            isNavigating && navView ? (
              <NavigationPeek
                arrival={navView.arrival}
                remainingSeconds={navView.remainingSeconds}
                remainingMeters={navView.remainingMeters}
                score={route.safety.score}
                onStop={stopNavigation}
              />
            ) : (
              <RouteOverviewPeek
                route={route}
                onStart={startNavigation}
                onHide={() => setSheetState("hidden")}
              />
            )
          }
        >
          <div className="space-y-4">
            {isNavigating && sharePanel(true)}
            <SafetyBreakdown safety={route.safety} explanation={explanation} embedded />
            {!isNavigating && sharePanel(true)}
          </div>
        </BottomSheet>
      )}

      {route && !isNavigating && sheetState === "hidden" && (
        <button
          type="button"
          onClick={() => setSheetState("peek")}
          className="absolute bottom-24 left-1/2 z-[2000] flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-background px-4 text-sm font-semibold shadow-[0_8px_30px_rgba(27,23,37,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        >
          <ChevronUp className="h-4 w-4" />
          Route · {route.durationLabel}
        </button>
      )}

      {selectedReport && (
        <div className="absolute left-4 right-4 z-[1000]" style={{ bottom: floatingBottom }}>
          <ReportCard
            report={selectedReport}
            currentUserId={user?.id ?? null}
            onClose={() => setSelectedReport(null)}
            onLike={handleLike}
            onDelete={handleDelete}
          />
        </div>
      )}

      {showWarnings && route && (
        <RouteWarningsDialog
          warnings={route.safety.warnings}
          totalWarnings={route.safety.totalWarnings}
          safetyScore={route.safety.score}
          onDismiss={() => setShowWarnings(false)}
        />
      )}

      {/* Boven de bottom-nav, en boven het routepaneel als dat er is. */}
      <div
        className="absolute right-4 z-[2500] transition-[bottom] duration-300 motion-reduce:transition-none"
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
