import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import Map, { AttributionControl, Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";
import type { Feature, LineString } from "geojson";
import { MapPin, Navigation, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DestinationPin, UserLocationDot } from "@/components/map/MapPins";
import {
  applyBasemapLook,
  readCssColor,
  resolveMapStyle,
  usesSlots,
} from "@/components/map/mapStyle";
import { MAPBOX_TOKEN } from "@/lib/env";
import { fetchSharedTrip, fetchSharedTripTrack, type SharedTripView } from "@/lib/trips";
import type { LatLng } from "@/lib/geo";

/**
 * De pagina achter een deellink: volg iemands rit live.
 *
 * Wie hier komt is niet ingelogd. De positie komt daarom uit
 * `get_shared_trip`, dat alleen antwoordt bij een geldig token van een lopende
 * rit. Er wordt gepolld in plaats van via Realtime meegeluisterd: Realtime
 * respecteert row level security, en een anonieme bezoeker heeft die toegang
 * bewust niet.
 */

/** Hoe vaak de stand wordt opgehaald. */
const POLL_INTERVAL_MS = 10_000;

const MAP_STYLE = resolveMapStyle("navigation");

const TripView = () => {
  const { token = "" } = useParams<{ token: string }>();

  const [trip, setTrip] = useState<SharedTripView | null>(null);
  const [track, setTrack] = useState<LatLng[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const mapRef = useRef<MapRef | null>(null);
  const hasCentredRef = useRef(false);

  // Haal de stand op, en blijf dat doen zolang de rit loopt.
  useEffect(() => {
    if (!token) return;
    let active = true;

    const load = async () => {
      try {
        const [current, path] = await Promise.all([
          fetchSharedTrip(token),
          fetchSharedTripTrack(token).catch(() => [] as LatLng[]),
        ]);
        if (!active) return;

        if (!current) {
          setNotFound(true);
          return;
        }

        setTrip(current);
        setTrack(path);
        setNotFound(false);
      } catch (error) {
        console.error("[SafeBuddy] Gedeelde rit ophalen mislukt:", error);
        if (active) setNotFound(true);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);

  // Alleen de eerste keer naar de positie gaan, daarna de kijker laten pannen.
  const lastLocation = trip?.lastLocation ?? null;
  useEffect(() => {
    if (!lastLocation || hasCentredRef.current || !mapRef.current) return;
    mapRef.current.jumpTo({ center: [lastLocation.lng, lastLocation.lat], zoom: 15 });
    hasCentredRef.current = true;
  }, [lastLocation]);

  const trackData = useMemo<Feature<LineString> | null>(
    () =>
      track.length > 1
        ? {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: track.map((p) => [p.lng, p.lat]) },
          }
        : null,
    [track]
  );

  const brand = useMemo(() => readCssColor("--brand-bright", "#A66CFF"), []);

  if (isLoading) {
    return <FullScreenMessage title="Rit laden..." />;
  }

  if (notFound || !trip) {
    return (
      <FullScreenMessage
        icon={<ShieldAlert className="h-10 w-10 text-muted-foreground" />}
        title="Deze link werkt niet meer"
        body="De rit is beëindigd, of de link klopt niet. Vraag de reiziger om een nieuwe link."
      />
    );
  }

  const who = trip.ownerName ?? "Iemand";
  const lastSeen = trip.lastLocationAt
    ? new Date(trip.lastLocationAt).toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="relative w-full flex-1" style={{ minHeight: "100vh" }}>
        <Map
          ref={(instance) => {
            mapRef.current = instance;
            // De eerste positie is er vaak al voordat de kaart bestaat.
            if (instance && trip.lastLocation) hasCentredRef.current = true;
          }}
          mapboxAccessToken={MAPBOX_TOKEN || undefined}
          reuseMaps
          initialViewState={
            trip.lastLocation
              ? { latitude: trip.lastLocation.lat, longitude: trip.lastLocation.lng, zoom: 15 }
              : { latitude: 52.3676, longitude: 4.9041, zoom: 13 }
          }
          mapStyle={MAP_STYLE}
          styleDiffing={false}
          attributionControl={false}
          style={{ position: "absolute", inset: 0 }}
          onLoad={(event) => {
            if (usesSlots(MAP_STYLE)) applyBasemapLook(event.target, false);
          }}
        >
          <AttributionControl compact position="bottom-left" />

          {trackData && (
            <Source id="trip-track" type="geojson" data={trackData}>
              <Layer
                id="trip-track-line"
                type="line"
                source="trip-track"
                {...(usesSlots(MAP_STYLE) ? { slot: "middle" } : {})}
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{
                  "line-color": brand,
                  "line-width": 5,
                  "line-opacity": 0.9,
                  "line-emissive-strength": 1,
                }}
              />
            </Source>
          )}

          {trip.destination && (
            <Marker
              latitude={trip.destination.lat}
              longitude={trip.destination.lng}
              anchor="bottom"
            >
              <DestinationPin />
            </Marker>
          )}

          {trip.lastLocation && (
            <Marker
              latitude={trip.lastLocation.lat}
              longitude={trip.lastLocation.lng}
              anchor="center"
            >
              <UserLocationDot />
            </Marker>
          )}
        </Map>
      </div>

      <div className="pointer-events-none absolute left-4 right-4 top-4 z-[1000]">
        <Card className="pointer-events-auto border-0 bg-background/95 shadow-lg backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <h1 className="text-base font-bold">{who} is onderweg</h1>
            </div>

            {trip.destinationAddress && (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Naar {trip.destinationAddress}</span>
              </p>
            )}

            <p className="mt-2 text-xs text-muted-foreground">
              {lastSeen ? `Locatie bijgewerkt om ${lastSeen}` : "Nog geen locatie ontvangen"}
              {trip.expectedArrival &&
                ` · verwacht om ${new Date(trip.expectedArrival).toLocaleTimeString("nl-NL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
            </p>

            {!trip.lastLocation && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                <Navigation className="h-3 w-3" />
                Wachten op de eerste locatie.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const FullScreenMessage = ({
  icon,
  title,
  body,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
}) => (
  <div className="flex min-h-screen items-center justify-center bg-background p-6">
    <div className="max-w-sm text-center">
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      <h1 className="mb-2 text-lg font-bold">{title}</h1>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
    </div>
  </div>
);

export default TripView;
