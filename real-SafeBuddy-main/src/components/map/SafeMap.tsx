import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Map, {
  AttributionControl,
  Layer,
  Marker,
  Source,
  type CircleLayerSpecification,
  type HeatmapLayerSpecification,
  type LineLayerSpecification,
  type MapMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import type { Map as MapboxMap } from "mapbox-gl";
import type { FeatureCollection, LineString, Feature, Point } from "geojson";
import { LocateFixed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { LatLng, NamedLocation } from "@/lib/geo";
import type { MappedReport, Severity } from "@/lib/reports/types";
import { MAPBOX_TOKEN } from "@/lib/env";
import { cn } from "@/lib/utils";
import {
  applyBasemapLook,
  findLabelLayerId,
  readCssColor,
  resolveMapStyle,
  styleKeyOf,
  usesSlots,
  type MapStyle,
} from "./mapStyle";
import { DestinationPin, NavigationArrow, StartPin, UserLocationDot } from "./MapPins";

/**
 * The Mapbox GL map: vector basemap, GPU heatmap of reports, route line and
 * markers, plus the tilted follow camera used while navigating.
 *
 * Only rendering lives here. Reports, routes and positions come in as props
 * in the same shapes the rest of the app already uses ([lat, lng] pairs).
 */

export type { MapStyle };
export type RouteKind = "safe" | "fast";

export interface MapViewport {
  center: LatLng;
  zoom: number;
  bounds: { north: number; south: number; east: number; west: number };
}

/** Where the navigation camera looks, and which way it faces. */
export interface NavigationCamera {
  target: LatLng;
  bearing: number;
}

export interface SafeMapProps {
  reports: readonly MappedReport[];
  /** Route line as [lat, lng] pairs. */
  routeCoordinates: readonly [number, number][] | null;
  routeKind?: RouteKind;
  start: NamedLocation | null;
  destination: NamedLocation | null;
  /** Live position, e.g. while navigating. */
  userPosition: LatLng | null;
  /** Where the map should go. A new value animates the camera there. */
  center: [number, number];
  zoom: number;
  isDark: boolean;
  mapStyle: MapStyle;
  /** Set while navigating: the camera tilts and follows. */
  navigationCamera?: NavigationCamera | null;
  /** Share of the route already travelled (0–1); that part is not drawn. */
  routeProgress?: number;
  /** Pixels at the bottom covered by a panel. Controls stay above it. */
  bottomInset?: number;
  onPointClick: (report: MappedReport) => void;
  /** Called when the user stops panning or zooming. */
  onMapMove?: (viewport: MapViewport) => void;
}

const REPORT_SOURCE_ID = "reports";
const HEATMAP_LAYER_ID = "reports-heat";
const REPORT_POINT_LAYER_ID = "reports-points";
const ROUTE_SOURCE_ID = "route";

/** From here individual reports are drawn and clickable. */
const POINT_MIN_ZOOM = 14;
const POINT_CLICK_MIN_ZOOM = 14.5;
/** Touch-friendly hit area around a tap, in pixels. */
const HIT_TOLERANCE = 12;

const NAV_PITCH = 60;
const NAV_ZOOM = 17.5;

const SEVERITY_COLOR: Record<Severity, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const FAST_ROUTE_COLOR = "#4B4658";
const BRIGHT_FALLBACK = "#A66CFF";
const GLOW_FALLBACK = "#E4D2FF";

const FAB_CLASS = cn(
  "absolute right-4 z-[2500] flex h-11 items-center justify-center rounded-full bg-background text-foreground",
  "shadow-[0_8px_30px_rgba(27,23,37,0.16)] transition-[bottom,background-color] duration-300 hover:bg-muted motion-reduce:transition-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
);

const HEATMAP_PAINT: HeatmapLayerSpecification["paint"] = {
  "heatmap-weight": ["match", ["get", "severity"], "high", 1, "critical", 1, "medium", 0.6, 0.3],
  "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 1, 16, 3],
  "heatmap-color": [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0, "rgba(0,0,0,0)",
    0.2, "rgba(34,197,94,0.35)",
    0.4, "rgba(251,191,36,0.6)",
    0.6, "rgba(249,115,22,0.75)",
    0.8, "rgba(239,68,68,0.85)",
    1, "rgba(220,38,38,0.9)",
  ],
  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 18, 16, 40],
  "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.85, 16, 0.4],
};

const REPORT_POINT_PAINT: CircleLayerSpecification["paint"] = {
  "circle-color": [
    "match",
    ["get", "severity"],
    "high", SEVERITY_COLOR.high,
    "critical", SEVERITY_COLOR.high,
    "medium", SEVERITY_COLOR.medium,
    SEVERITY_COLOR.low,
  ],
  "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 4, 18, 9],
  "circle-stroke-color": "#ffffff",
  "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 2],
  "circle-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.9],
  "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 1],
  "circle-emissive-strength": 1,
};

const ROUTE_LAYOUT: LineLayerSpecification["layout"] = {
  "line-cap": "round",
  "line-join": "round",
};

type ReportFeatures = FeatureCollection<Point, { i: number; severity: Severity }>;

const SafeMap = ({
  reports,
  routeCoordinates,
  routeKind = "safe",
  start,
  destination,
  userPosition,
  center,
  zoom,
  isDark,
  mapStyle,
  navigationCamera = null,
  routeProgress = 0,
  bottomInset = 0,
  onPointClick,
  onMapMove,
}: SafeMapProps) => {
  const mapRef = useRef<MapRef | null>(null);
  const mapInstanceRef = useRef<MapboxMap | null>(null);

  // Event handlers read the latest values through refs, so they can stay
  // stable and are not re-bound on the map every render.
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const onPointClickRef = useRef(onPointClick);
  onPointClickRef.current = onPointClick;
  const onMapMoveRef = useRef(onMapMove);
  onMapMoveRef.current = onMapMove;
  const bottomInsetRef = useRef(bottomInset);
  bottomInsetRef.current = bottomInset;

  const style = useMemo(() => resolveMapStyle(mapStyle), [mapStyle]);
  const styleKey = styleKeyOf(style);
  const slots = usesSlots(style);
  const styleRef = useRef(style);
  styleRef.current = style;
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  // Data layers are only rendered once the current style has loaded and its
  // label layer is known. Inserting before a layer that belongs to the
  // previous style would fail.
  const [loadedStyle, setLoadedStyle] = useState<{ key: string; labelLayerId?: string } | null>(
    null
  );
  const layersReady = loadedStyle?.key === styleKey;
  const beforeId = layersReady && !slots ? loadedStyle.labelLayerId : undefined;

  // Where each data layer goes: a named slot on Mapbox Standard, or below the
  // first label layer on classic styles.
  const belowLabels = slots ? { slot: "middle" } : { beforeId };
  const onTop = slots ? { slot: "top" } : {};

  const syncStyle = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const current = styleRef.current;
    if (usesSlots(current)) applyBasemapLook(map, isDarkRef.current);
    setLoadedStyle({
      key: styleKeyOf(current),
      labelLayerId: usesSlots(current) ? undefined : findLabelLayerId(map),
    });
  }, []);

  // Dark mode only changes the light preset, so no style reload is needed.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map && layersReady && slots) applyBasemapLook(map, isDark);
  }, [isDark, layersReady, slots]);

  const handleLoad = useCallback(
    (event: { target: MapboxMap }) => {
      const map = event.target;
      mapInstanceRef.current = map;
      // `reuseMaps` recycles the instance, so never register twice.
      map.off("style.load", syncStyle);
      map.on("style.load", syncStyle);
      syncStyle();
    },
    [syncStyle]
  );

  useEffect(
    () => () => {
      mapInstanceRef.current?.off("style.load", syncStyle);
    },
    [syncStyle]
  );

  // Follow centre and zoom from props. The first value is the initial view.
  const hasFocusedRef = useRef(false);
  useEffect(() => {
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true;
      return;
    }
    // Mapbox skips non-essential animations under prefers-reduced-motion.
    mapRef.current?.flyTo({ center: [center[1], center[0]], zoom });
  }, [center, zoom]);

  // --- Navigation camera -------------------------------------------------

  const isNavigating = navigationCamera !== null;
  const isNavigatingRef = useRef(isNavigating);
  isNavigatingRef.current = isNavigating;
  const [isFollowing, setIsFollowing] = useState(true);

  // Start following when navigation begins; level the camera when it ends.
  const wasNavigatingRef = useRef(false);
  useEffect(() => {
    if (isNavigating) {
      setIsFollowing(true);
    } else if (wasNavigatingRef.current) {
      mapRef.current?.easeTo({
        pitch: 0,
        bearing: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 800,
      });
    }
    wasNavigatingRef.current = isNavigating;
  }, [isNavigating]);

  const targetLat = navigationCamera?.target.lat;
  const targetLng = navigationCamera?.target.lng;
  const cameraBearing = navigationCamera ? Math.round(navigationCamera.bearing) : 0;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || targetLat === undefined || targetLng === undefined || !isFollowing) return;

    // Put the user in the lower part of the screen, looking ahead.
    const height = map.getContainer().clientHeight;
    const bottom = Math.min(bottomInset, height * 0.5);
    map.easeTo({
      center: [targetLng, targetLat],
      bearing: cameraBearing,
      pitch: NAV_PITCH,
      zoom: NAV_ZOOM,
      padding: {
        top: Math.max(0, Math.min(height * 0.4, height - bottom - 120)),
        bottom,
        left: 0,
        right: 0,
      },
      duration: 1000,
    });
  }, [targetLat, targetLng, cameraBearing, isFollowing, bottomInset]);

  // Panning or rotating by hand pauses following until "Centreren". Camera
  // animations fire the same events, but without an originalEvent.
  const pauseFollowing = useCallback((event: ViewStateChangeEvent) => {
    const byUser = Boolean((event as { originalEvent?: unknown }).originalEvent);
    if (isNavigatingRef.current && byUser) setIsFollowing(false);
  }, []);

  // --- Data --------------------------------------------------------------

  const reportData = useMemo<ReportFeatures>(
    () => ({
      type: "FeatureCollection",
      features: reports.map((item, i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [item.lng, item.lat] },
        properties: { i, severity: item.report.severity },
      })),
    }),
    [reports]
  );

  const routeData = useMemo<Feature<LineString> | null>(
    () =>
      routeCoordinates && routeCoordinates.length > 1
        ? {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: routeCoordinates.map(([lat, lng]) => [lng, lat]),
            },
          }
        : null,
    [routeCoordinates]
  );

  // Frame a new route. Keyed on the geometry, so a re-score of the same route
  // (lighting arrives later) does not yank the camera back.
  const routeKey = routeCoordinates?.length
    ? `${routeCoordinates.length}:${routeCoordinates[0].join()}:${routeCoordinates[routeCoordinates.length - 1].join()}`
    : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeCoordinates || routeCoordinates.length < 2 || isNavigatingRef.current) return;

    let [minLat, minLng, maxLat, maxLng] = [90, 180, -90, -180];
    for (const [lat, lng] of routeCoordinates) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }

    // Leave room for the search bar and the route sheet. The sheet may not
    // have measured itself yet, so assume a typical height.
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      {
        padding: {
          top: Math.min(170, height * 0.3),
          bottom: Math.min(Math.max(bottomInsetRef.current, 180) + 24, height * 0.4),
          left: Math.min(48, width * 0.1),
          right: Math.min(48, width * 0.1),
        },
        maxZoom: 17,
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const routeColors = useMemo(
    () => ({
      bright: readCssColor("--brand-bright", BRIGHT_FALLBACK),
      glow: readCssColor("--brand-glow", GLOW_FALLBACK),
    }),
    []
  );
  const trim = Math.min(1, Math.max(0, routeProgress));
  const isSafeRoute = routeKind === "safe";

  // The safe route glows: a soft wide halo in its own colour, the line, and a
  // thin light core that makes it read as lit rather than painted on.
  // Emissive strength 1 keeps the dusk/night lighting of Mapbox Standard from
  // dimming the colours.
  const routeHaloPaint = useMemo<LineLayerSpecification["paint"]>(
    () => ({
      "line-color": isSafeRoute ? routeColors.bright : "#ffffff",
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 16, 18, 34],
      "line-blur": ["interpolate", ["linear"], ["zoom"], 12, 6, 18, 12],
      "line-opacity": isSafeRoute ? 0.55 : 0.75,
      "line-emissive-strength": 1,
      "line-trim-offset": [0, trim],
    }),
    [isSafeRoute, routeColors, trim]
  );
  const routePaint = useMemo<LineLayerSpecification["paint"]>(
    () => ({
      "line-color": isSafeRoute ? routeColors.bright : FAST_ROUTE_COLOR,
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 6, 18, 14],
      "line-emissive-strength": 1,
      "line-trim-offset": [0, trim],
    }),
    [isSafeRoute, routeColors, trim]
  );
  const routeCorePaint = useMemo<LineLayerSpecification["paint"]>(
    () => ({
      "line-color": routeColors.glow,
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 18, 4],
      "line-blur": 1,
      "line-opacity": 0.8,
      "line-emissive-strength": 1,
      "line-trim-offset": [0, trim],
    }),
    [routeColors, trim]
  );

  // --- Interaction -------------------------------------------------------

  const handleClick = useCallback((event: MapMouseEvent) => {
    const map = event.target;
    if (map.getZoom() < POINT_CLICK_MIN_ZOOM || !map.getLayer(REPORT_POINT_LAYER_ID)) return;

    const { x, y } = event.point;
    const [feature] = map.queryRenderedFeatures(
      [
        [x - HIT_TOLERANCE, y - HIT_TOLERANCE],
        [x + HIT_TOLERANCE, y + HIT_TOLERANCE],
      ],
      { layers: [REPORT_POINT_LAYER_ID] }
    );
    const index = feature?.properties?.i;
    const report = typeof index === "number" ? reportsRef.current[index] : undefined;
    if (report) onPointClickRef.current(report);
  }, []);

  const [cursor, setCursor] = useState<string>();

  const handleMoveEnd = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !onMapMoveRef.current) return;
    const mapCenter = map.getCenter();
    const bounds = map.getBounds();
    if (!bounds) return;
    onMapMoveRef.current({
      center: { lat: mapCenter.lat, lng: mapCenter.lng },
      zoom: map.getZoom(),
      bounds: {
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      },
    });
  }, []);

  // Without a live position, the recenter button asks for one on demand.
  const [locatedPosition, setLocatedPosition] = useState<LatLng | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const shownPosition = userPosition ?? locatedPosition;

  const recenter = () => {
    if (isNavigating) {
      setIsFollowing(true);
      return;
    }

    const flyTo = (target: LatLng) => {
      const map = mapRef.current;
      map?.flyTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), 16) });
    };

    if (userPosition) {
      flyTo(userPosition);
      return;
    }
    if (!("geolocation" in navigator)) {
      toast.error("Deze browser ondersteunt geen locatie");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const target = { lat: position.coords.latitude, lng: position.coords.longitude };
        setLocatedPosition(target);
        setIsLocating(false);
        flyTo(target);
      },
      (error) => {
        setIsLocating(false);
        toast.error(
          error.code === 1
            ? "Locatie geweigerd. Sta locatie toe in je browserinstellingen."
            : "Kon je locatie niet ophalen"
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 }
    );
  };

  // Above the SOS button, which sits 12 px above the covered area.
  const fabBottom = bottomInset + 80;

  return (
    <div
      className="relative h-full w-full"
      style={{ "--sb-map-inset": `${bottomInset}px` } as CSSProperties}
    >
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN || undefined}
        reuseMaps
        initialViewState={{ latitude: center[0], longitude: center[1], zoom }}
        mapStyle={style}
        styleDiffing={false}
        attributionControl={false}
        style={{ position: "absolute", inset: 0 }}
        cursor={cursor}
        interactiveLayerIds={layersReady ? [REPORT_POINT_LAYER_ID] : undefined}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor(undefined)}
        onLoad={handleLoad}
        onClick={handleClick}
        onMoveEnd={handleMoveEnd}
        onDragStart={pauseFollowing}
        onRotateStart={pauseFollowing}
      >
        <AttributionControl compact position="bottom-left" />

        {layersReady && (
          <Source id={REPORT_SOURCE_ID} type="geojson" data={reportData}>
            <Layer
              id={HEATMAP_LAYER_ID}
              type="heatmap"
              source={REPORT_SOURCE_ID}
              {...belowLabels}
              paint={HEATMAP_PAINT}
            />
          </Source>
        )}

        {layersReady && routeData && (
          // lineMetrics is required for line-trim-offset.
          <Source id={ROUTE_SOURCE_ID} type="geojson" data={routeData} lineMetrics>
            <Layer
              id="route-halo"
              type="line"
              source={ROUTE_SOURCE_ID}
              {...belowLabels}
              layout={ROUTE_LAYOUT}
              paint={routeHaloPaint}
            />
            <Layer
              id="route-line"
              type="line"
              source={ROUTE_SOURCE_ID}
              {...belowLabels}
              layout={ROUTE_LAYOUT}
              paint={routePaint}
            />
            {isSafeRoute && (
              <Layer
                id="route-core"
                type="line"
                source={ROUTE_SOURCE_ID}
                {...belowLabels}
                layout={ROUTE_LAYOUT}
                paint={routeCorePaint}
              />
            )}
          </Source>
        )}

        {/* Points sit on top of everything, so they stay clickable. */}
        {layersReady && (
          <Layer
            id={REPORT_POINT_LAYER_ID}
            type="circle"
            source={REPORT_SOURCE_ID}
            {...onTop}
            minzoom={POINT_MIN_ZOOM}
            paint={REPORT_POINT_PAINT}
          />
        )}

        {start && !isNavigating && (
          <Marker latitude={start.lat} longitude={start.lng} anchor="center">
            <StartPin />
          </Marker>
        )}
        {destination && (
          <Marker latitude={destination.lat} longitude={destination.lng} anchor="bottom">
            <DestinationPin />
          </Marker>
        )}
        {shownPosition &&
          (navigationCamera ? (
            <Marker
              latitude={shownPosition.lat}
              longitude={shownPosition.lng}
              anchor="center"
              rotation={navigationCamera.bearing}
              rotationAlignment="map"
              pitchAlignment="map"
            >
              <NavigationArrow />
            </Marker>
          ) : (
            <Marker latitude={shownPosition.lat} longitude={shownPosition.lng} anchor="center">
              <UserLocationDot />
            </Marker>
          ))}
      </Map>

      {isNavigating ? (
        !isFollowing && (
          <button
            type="button"
            onClick={recenter}
            className={cn(FAB_CLASS, "gap-2 px-4 text-sm font-semibold")}
            style={{ bottom: fabBottom }}
          >
            <LocateFixed className="h-5 w-5" style={{ color: "var(--brand)" }} />
            Centreren
          </button>
        )
      ) : (
        <button
          type="button"
          onClick={recenter}
          disabled={isLocating}
          aria-label="Centreer op mijn locatie"
          className={cn(FAB_CLASS, "w-11")}
          style={{ bottom: fabBottom }}
        >
          {isLocating ? (
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
          ) : (
            <LocateFixed className="h-5 w-5" style={{ color: "var(--brand)" }} />
          )}
        </button>
      )}
    </div>
  );
};

export default SafeMap;
