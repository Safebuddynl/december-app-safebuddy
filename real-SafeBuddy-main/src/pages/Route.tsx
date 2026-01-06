import { useState, useEffect, useRef } from "react";
import { Locate, Route as RouteIcon, Shield, Car, Bike, Footprints, Sparkles, Sun, Moon, Clock, Filter, AlertTriangle, ThumbsUp, X, TrendingUp, Navigation, Square, Map, Satellite } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import BottomNav from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

// Beautiful 3D red marker with gradient and shadow
const RedIcon = L.icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCAzMiA0OCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImdyYWQiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZWY0NDQ0O3N0b3Atb3BhY2l0eToxIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdHlsZT0ic3RvcC1jb2xvcjojZGMyNjI2O3N0b3Atb3BhY2l0eToxIi8+PC9saW5lYXJHcmFkaWVudD48ZmlsdGVyIGlkPSJzaGFkb3ciPjxmZUdhdXNzaWFuQmx1ciBpbj0iU291cmNlQWxwaGEiIHN0ZERldmlhdGlvbj0iMS41Ii8+PGZlT2Zmc2V0IGR4PSIwIiBkeT0iMiIgcmVzdWx0PSJvZmZzZXRibHVyIi8+PGZlQ29tcG9uZW50VHJhbnNmZXI+PGZlRnVuY0EgdHlwZT0ibGluZWFyIiBzbG9wZT0iMC40Ii8+PC9mZUNvbXBvbmVudFRyYW5zZmVyPjxmZU1lcmdlPjxmZU1lcmdlTm9kZS8+PGZlTWVyZ2VOb2RlIGluPSJTb3VyY2VHcmFwaGljIi8+PC9mZU1lcmdlPjwvZmlsdGVyPjwvZGVmcz48cGF0aCBkPSJNMTYgMkM5LjkgMiA1IDYuOSA1IDEzYzAgOC4yIDExIDI1IDExIDI1czExLTE2LjggMTEtMjVjMC02LjEtNC45LTExLTExLTExem0wIDE1Yy0yLjIgMC00LTEuOC00LTRzMS44LTQgNC00IDQgMS44IDQgNC0xLjggNC00IDR6IiBmaWxsPSJ1cmwoI2dyYWQpIiBmaWx0ZXI9InVybCgjc2hhZG93KSIvPjxjaXJjbGUgY3g9IjE2IiBjeT0iMTMiIHI9IjMiIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjAuOSIvPjwvc3ZnPg==',
  shadowUrl: iconShadow,
  iconSize: [32, 48],
  iconAnchor: [16, 48],
  popupAnchor: [0, -48],
});

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: icon, shadowUrl: iconShadow });

interface Location {
  lat: number;
  lng: number;
  name: string;
}

interface RouteInfo {
  distance: string;
  duration: string;
  coordinates: [number, number][];
  safetyScore?: number;
  dangerousAreas?: string[];
  message?: string;
}

interface SearchSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface SafetyReport {
  id: string;
  location_address: string;
  severity: string;
  report_type: string;
  created_at: string;
  description: string | null;
  upvotes: number | null;
}

interface HeatPoint {
  lat: number;
  lng: number;
  report: SafetyReport;
}

type TravelMode = "foot" | "bike" | "car";
type TimeFilter = "live" | "1h" | "24h" | "week" | "all";

const TIME_FILTERS = [
  { value: "live", label: "Live" },
  { value: "1h", label: "1h" },
  { value: "24h", label: "24h" },
  { value: "week", label: "Week" },
  { value: "all", label: "All" },
];

const Route = () => {
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [startLocation, setStartLocation] = useState<Location | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<Location | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([52.3676, 4.9041]);
  const [mapZoom, setMapZoom] = useState(12);
  const [travelMode, setTravelMode] = useState<TravelMode>("foot");
  
  const [startSuggestions, setStartSuggestions] = useState<SearchSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] = useState<SearchSuggestion[]>([]);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  
  // Heatmap state
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mapStyle, setMapStyle] = useState<'navigation' | 'satellite'>('navigation');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<HeatPoint | null>(null);
  const [stats, setStats] = useState({ high: 0, medium: 0, low: 0 });
  
  // Navigation state
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Location | null>(null);
  const [heading, setHeading] = useState<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const currentPositionMarkerRef = useRef<L.Marker | null>(null);
  
  const startInputRef = useRef<HTMLDivElement>(null);
  const destinationInputRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const startMarkerRef = useRef<L.Marker | null>(null);
  const destinationMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const heatLayerRef = useRef<any>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    applyTimeFilter();
  }, [timeFilter, reports]);

  const fetchReports = async () => {
    const { data, error } = await supabase
      .from("safety_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setReports(data);
    }
  };

  const applyTimeFilter = async () => {
    let filtered = [...reports];
    const now = new Date();

    if (timeFilter === "live") {
      filtered = filtered.filter(r => (now.getTime() - new Date(r.created_at).getTime()) < 15 * 60 * 1000);
    } else if (timeFilter === "1h") {
      filtered = filtered.filter(r => (now.getTime() - new Date(r.created_at).getTime()) < 60 * 60 * 1000);
    } else if (timeFilter === "24h") {
      filtered = filtered.filter(r => (now.getTime() - new Date(r.created_at).getTime()) < 24 * 60 * 60 * 1000);
    } else if (timeFilter === "week") {
      filtered = filtered.filter(r => (now.getTime() - new Date(r.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000);
    }

    const statsObj = { high: 0, medium: 0, low: 0 };
    filtered.forEach((report) => {
      if (report.severity === "high") statsObj.high++;
      else if (report.severity === "medium") statsObj.medium++;
      else statsObj.low++;
    });
    setStats(statsObj);

    await geocodeReports(filtered);
  };

  const geocodeReports = async (reportData: SafetyReport[]) => {
    const points: HeatPoint[] = [];
    for (const report of reportData.slice(0, 20)) { // Limit to 20 for performance
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(report.location_address + ", Netherlands")}&format=json&limit=1`
        );
        const data = await response.json();
        if (data && data.length > 0) {
          points.push({
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            report,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch (error) {
        console.error("Geocoding error:", error);
      }
    }
    setHeatPoints(points);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (startInputRef.current && !startInputRef.current.contains(event.target as Node)) {
        setShowStartSuggestions(false);
      }
      if (destinationInputRef.current && !destinationInputRef.current.contains(event.target as Node)) {
        setShowDestinationSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      toast.loading("Getting your location...");
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location: Location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            name: "My Location",
          };
          try {
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json`
            );
            const data = await response.json();
            if (data.display_name) {
              location.name = data.display_name;
            }
          } catch (error) {
            console.error("Reverse geocoding failed:", error);
          }
          setStart("My Location");
          setStartLocation(location);
          setMapCenter([location.lat, location.lng]);
          setMapZoom(15);
          toast.dismiss();
          toast.success("Location detected");
        },
        () => {
          toast.dismiss();
          toast.error("Unable to get your location");
        }
      );
    }
  };

  const searchSuggestions = async (query: string, isStart: boolean) => {
    if (!query.trim() || query === "My Location") return;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`
      );
      const data = await response.json();
      if (data && data.length > 0) {
        if (isStart) {
          setStartSuggestions(data);
          setShowStartSuggestions(true);
        } else {
          setDestinationSuggestions(data);
          setShowDestinationSuggestions(true);
        }
      }
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (start && start !== "My Location") searchSuggestions(start, true);
    }, 500);
    return () => clearTimeout(timer);
  }, [start]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (destination) searchSuggestions(destination, false);
    }, 500);
    return () => clearTimeout(timer);
  }, [destination]);

  // Initialize map
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    console.log('Mapbox token:', mapboxToken ? 'Found' : 'Missing');
    
    const map = L.map(mapContainerRef.current).setView(mapCenter, mapZoom);
    
    let tile;
    if (mapboxToken) {
      tile = L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
        {
          attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a>',
          tileSize: 512,
          zoomOffset: -1,
        }
      );
    } else {
      // Fallback to OpenStreetMap
      tile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      });
      console.warn('Using OpenStreetMap fallback - Mapbox token missing');
    }
    
    tile.addTo(map);
    tileLayerRef.current = tile;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (mapRef.current) mapRef.current.setView(mapCenter, mapZoom);
  }, [mapCenter, mapZoom]);

  // Toggle dark mode tiles and map style
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    const map = mapRef.current;
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    map.removeLayer(tileLayerRef.current);
    
    let newTile;
    if (mapboxToken) {
      let styleUrl;
      if (mapStyle === 'satellite') {
        styleUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`;
      } else {
        styleUrl = isDarkMode
          ? `https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
          : `https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`;
      }
      
      newTile = L.tileLayer(styleUrl, { 
        attribution: '&copy; Mapbox',
        tileSize: 512,
        zoomOffset: -1,
      });
    } else {
      // Fallback to OpenStreetMap
      newTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      });
    }
    
    newTile.addTo(map);
    tileLayerRef.current = newTile;
  }, [isDarkMode, mapStyle]);

  // Update markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear old heat layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    // Clear heat markers
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    // Create heatmap data with intensity based on severity
    const heatData: [number, number, number][] = heatPoints.map((point) => {
      const intensity = point.report.severity === "high" ? 1.0 : point.report.severity === "medium" ? 0.6 : 0.3;
      return [point.lat, point.lng, intensity];
    });

    // Add heatmap layer
    if (heatData.length > 0 && (L as any).heatLayer) {
      heatLayerRef.current = (L as any).heatLayer(heatData, {
        radius: 40,
        blur: 35,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.0: '#22c55e',
          0.3: '#fbbf24',
          0.5: '#f59e0b',
          0.7: '#f97316',
          0.9: '#ef4444',
          1.0: '#dc2626'
        }
      }).addTo(map);
    }

    // Add clickable markers on top for interactivity
    heatPoints.forEach((point) => {
      const color = point.report.severity === "high" ? "#ef4444" : point.report.severity === "medium" ? "#f59e0b" : "#22c55e";
      const circle = L.circleMarker([point.lat, point.lng], {
        radius: 6,
        fillColor: color,
        color: "#ffffff",
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.6,
      }).addTo(map);
      circle.on("click", () => setSelectedPoint(point));
    });

    // Route markers - Modern markers for start and destination
    if (startLocation) {
      if (startMarkerRef.current) startMarkerRef.current.setLatLng([startLocation.lat, startLocation.lng]);
      else {
        startMarkerRef.current = L.marker([startLocation.lat, startLocation.lng], { icon: RedIcon }).addTo(map);
      }
    } else if (startMarkerRef.current) {
      map.removeLayer(startMarkerRef.current);
      startMarkerRef.current = null;
    }

    // Current position marker (blue pulsing dot for navigation)
    if (currentPosition && isNavigating) {
      const currentPosIcon = L.divIcon({
        html: `<div style="width: 20px; height: 20px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);"></div>`,
        className: 'current-position-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      
      if (currentPositionMarkerRef.current) {
        currentPositionMarkerRef.current.setLatLng([currentPosition.lat, currentPosition.lng]);
      } else {
        currentPositionMarkerRef.current = L.marker([currentPosition.lat, currentPosition.lng], { icon: currentPosIcon }).addTo(map);
      }
    } else if (currentPositionMarkerRef.current && !isNavigating) {
      map.removeLayer(currentPositionMarkerRef.current);
      currentPositionMarkerRef.current = null;
    }

    if (destinationLocation) {
      if (destinationMarkerRef.current) destinationMarkerRef.current.setLatLng([destinationLocation.lat, destinationLocation.lng]);
      else {
        destinationMarkerRef.current = L.marker([destinationLocation.lat, destinationLocation.lng], { icon: RedIcon }).addTo(map);
      }
    } else if (destinationMarkerRef.current) {
      map.removeLayer(destinationMarkerRef.current);
      destinationMarkerRef.current = null;
    }

    if (routeInfo && routeInfo.coordinates.length > 0) {
      if (routeLineRef.current) map.removeLayer(routeLineRef.current);
      // Dark blue route line like Google Maps
      const routeColor = "#1a73e8";
      routeLineRef.current = L.polyline(routeInfo.coordinates, { color: routeColor, weight: 6, opacity: 0.9 }).addTo(map);
      map.fitBounds(routeLineRef.current.getBounds(), { padding: [40, 40] });
    } else if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }
  }, [startLocation, destinationLocation, routeInfo, heatPoints, currentPosition, isNavigating]);

  const selectStartSuggestion = (suggestion: SearchSuggestion) => {
    const location: Location = { lat: parseFloat(suggestion.lat), lng: parseFloat(suggestion.lon), name: suggestion.display_name };
    setStart(suggestion.display_name);
    setStartLocation(location);
    setShowStartSuggestions(false);
    setMapCenter([location.lat, location.lng]);
    setMapZoom(15);
  };

  const selectDestinationSuggestion = (suggestion: SearchSuggestion) => {
    const location: Location = { lat: parseFloat(suggestion.lat), lng: parseFloat(suggestion.lon), name: suggestion.display_name };
    setDestination(suggestion.display_name);
    setDestinationLocation(location);
    setShowDestinationSuggestions(false);
    setMapCenter([location.lat, location.lng]);
    setMapZoom(15);
  };

  const handleGetRoute = async () => {
    if (!start || !destination) {
      toast.error("Vul zowel start als bestemming in");
      return;
    }
    if (!startLocation || !destinationLocation) {
      toast.error("Selecteer locaties uit de suggesties");
      return;
    }

    setRouteError(null);
    const modeLabel = travelMode === "foot" ? "lopen" : travelMode === "bike" ? "fietsen" : "rijden";
    toast.loading(`Berekenen van veiligste route voor ${modeLabel}...`);

    // Helper function to calculate route safety
    const calculateRouteSafety = (coords: [number, number][]) => {
      let score = 100;
      const dangerousAreas: string[] = [];
      const checkedReports = new Set<string>();

      for (const [lat, lng] of coords) {
        for (const point of heatPoints) {
          if (checkedReports.has(point.report.id)) continue;
          
          const distance = calculateDistance(lat, lng, point.lat, point.lng);
          
          if (distance < 0.5) {
            checkedReports.add(point.report.id);
            
            if (point.report.severity === "high") {
              score -= 30;
              dangerousAreas.push(`${point.report.report_type} (Hoog risico) bij ${point.report.location_address}`);
            } else if (point.report.severity === "medium") {
              score -= 15;
              dangerousAreas.push(`${point.report.report_type} (Gemiddeld risico) bij ${point.report.location_address}`);
            } else {
              score -= 5;
            }
          }
        }
      }

      return { score: Math.max(0, score), dangerousAreas };
    };

    try {
      // Mapbox Directions API met verschillende profiles voor auto, fiets en lopen
      const profileMap: Record<TravelMode, string> = {
        car: "mapbox/driving",
        bike: "mapbox/cycling",
        foot: "mapbox/walking",
      };

      const profile = profileMap[travelMode];
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      
      if (!mapboxToken) {
        console.error('Mapbox token niet gevonden!');
        throw new Error('Mapbox token ontbreekt');
      }
      
      // Mapbox Directions API call
      const mapboxUrl = `https://api.mapbox.com/directions/v5/${profile}/${startLocation.lng},${startLocation.lat};${destinationLocation.lng},${destinationLocation.lat}?alternatives=true&geometries=geojson&overview=full&access_token=${mapboxToken}`;
      
      console.log('Fetching route from Mapbox...');
      console.log('Profile:', profile);
      console.log('Start:', startLocation.lat, startLocation.lng);
      console.log('Destination:', destinationLocation.lat, destinationLocation.lng);
      
      const routeResponse = await fetch(mapboxUrl);
      const routeData = await routeResponse.json();
      
      console.log('Mapbox response status:', routeResponse.status);
      console.log('Mapbox response data:', routeData);
      
      if (!routeResponse.ok) {
        console.error('Mapbox API error:', routeData);
        throw new Error(`Mapbox API fout: ${routeData.message || routeResponse.status}`);
      }

      if (!routeData.routes || routeData.routes.length === 0) {
        console.error('Geen routes gevonden in response');
        throw new Error("Kon geen route berekenen");
      }

      // Evaluate all routes for safety and pick the best one
      const routesWithSafety = routeData.routes.map((route: any) => {
        const coordinates: [number, number][] = route.geometry.coordinates.map(
          (coord: number[]) => [coord[1], coord[0]]
        );
        
        const safety = calculateRouteSafety(coordinates);
        
        return {
          route,
          coordinates,
          safety,
          distance: route.distance,
          duration: route.duration,
        };
      });

      // Sort by safety score first (higher is better), then by duration if scores are equal
      routesWithSafety.sort((a: any, b: any) => {
        const safetyDiff = b.safety.score - a.safety.score;
        // If safety scores are very close (within 10 points), prefer faster route
        if (Math.abs(safetyDiff) < 10) {
          return a.duration - b.duration;
        }
        return safetyDiff;
      });

      // Use the safest route (or fastest if equally safe)
      const bestRoute = routesWithSafety[0];
      const coordinates = bestRoute.coordinates;
      const distanceMeters = bestRoute.distance;
      const durationSeconds = bestRoute.duration;
      
      const safetyScore = bestRoute.safety.score;
      const dangerousAreas = bestRoute.safety.dangerousAreas;

      // Calculate distance and duration
      const distanceKm = distanceMeters / 1000;
      const durationMinutes = Math.round(durationSeconds / 60);

      const message =
        safetyScore < 70
          ? "Waarschuwing: Deze route passeert gemelde veiligheidsproblemen"
          : safetyScore < 90
          ? "Route is relatief veilig met kleine zorgen"
          : "Route is vrij van veiligheidsproblemen";

      setRouteInfo({
        distance: distanceKm.toFixed(2) + " km",
        duration: durationMinutes + " min",
        coordinates: coordinates,
        safetyScore: safetyScore,
        dangerousAreas: dangerousAreas,
        message: message,
      });

      toast.dismiss();
      if (safetyScore < 70) toast.warning(message);
      else toast.success("Route berekend!");
    } catch (error: any) {
      console.error("Routing error:", error);
      console.error("Error details:", error.message);
      toast.dismiss();
      
      // Geef specifieke foutmelding
      const errorMessage = error.message || "Onbekende fout";
      setRouteError(`Routing mislukt: ${errorMessage}`);
      toast.error(`Routing mislukt: ${errorMessage}`);
    }
  };

  // Helper function to calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Start navigation mode
  const startNavigation = () => {
    if (!navigator.geolocation) {
      toast.error("GPS niet beschikbaar");
      return;
    }

    // Get current position first and center map
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const initialPos: Location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          name: "Current Position",
        };
        
        setCurrentPosition(initialPos);
        
        // Center map on current position immediately
        if (mapRef.current) {
          mapRef.current.setView([initialPos.lat, initialPos.lng], 17, { animate: true });
        }
        
        setIsNavigating(true);
        toast.success("Navigatie gestart");

        // Watch position continuously
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const newPos: Location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              name: "Current Position",
            };
            
            setCurrentPosition(newPos);
            
            // Calculate heading if available
            if (position.coords.heading !== null) {
              setHeading(position.coords.heading);
            }
            
            // Auto-center map on current position with smooth animation
            if (mapRef.current) {
              mapRef.current.setView([newPos.lat, newPos.lng], 18, { 
                animate: true,
                duration: 0.5
              });
            }
          },
          (error) => {
            console.error("GPS error:", error);
            toast.error("GPS locatie kon niet worden verkregen");
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          }
        );
      },
      (error) => {
        console.error("Initial GPS error:", error);
        toast.error("Kon beginlocatie niet ophalen");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  };

  // Stop navigation mode
  const stopNavigation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsNavigating(false);
    setCurrentPosition(null);
    toast.info("Navigatie gestopt");
  };

  // Clean up watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleUpvote = async (reportId: string) => {
    const report = reports.find(r => r.id === reportId);
    if (!report) return;
    const { error } = await supabase
      .from("safety_reports")
      .update({ upvotes: (report.upvotes || 0) + 1 })
      .eq("id", reportId);
    if (!error) {
      toast.success("Report validated!");
      fetchReports();
    }
  };

  const getTimeAgo = (date: string) => {
    const diffMs = Date.now() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffMs / 86400000)}d ago`;
  };

  return (
    <div className="min-h-screen bg-background pb-20 flex flex-col relative">
      {/* Map takes full height */}
      <div ref={mapContainerRef} className="flex-1 w-full z-0" style={{ minHeight: "calc(100vh - 80px)" }} />

      {/* Floating Search Card - Google Maps style */}
      <div className="absolute top-4 left-4 right-4 z-[1000]">
        <Card className="shadow-lg border-0 bg-background/95 backdrop-blur-sm">
          <CardContent className="p-3 space-y-2">
            {/* Search inputs row */}
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative" ref={startInputRef}>
                <Input
                  placeholder="Start location"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="h-10 text-sm pr-8 bg-muted/50 border-0"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGetCurrentLocation}
                  className="absolute right-1 top-1 h-8 w-8 p-0"
                >
                  <Locate className="h-4 w-4" />
                </Button>
                {showStartSuggestions && startSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {startSuggestions.map((s, i) => (
                      <button key={i} onClick={() => selectStartSuggestion(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted truncate">
                        {s.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 relative" ref={destinationInputRef}>
                <Input
                  placeholder="Destination"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="h-10 text-sm bg-muted/50 border-0"
                />
                {showDestinationSuggestions && destinationSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {destinationSuggestions.map((s, i) => (
                      <button key={i} onClick={() => selectDestinationSuggestion(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted truncate">
                        {s.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button size="icon" onClick={handleGetRoute} className="h-10 w-10 shrink-0">
                <RouteIcon className="h-4 w-4" />
              </Button>
            </div>

            {/* Travel mode + controls row */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                <Button size="sm" variant={travelMode === "foot" ? "default" : "ghost"} onClick={() => setTravelMode("foot")} className="h-8 px-2">
                  <Footprints className="h-4 w-4" />
                </Button>
                <Button size="sm" variant={travelMode === "bike" ? "default" : "ghost"} onClick={() => setTravelMode("bike")} className="h-8 px-2">
                  <Bike className="h-4 w-4" />
                </Button>
                <Button size="sm" variant={travelMode === "car" ? "default" : "ghost"} onClick={() => setTravelMode("car")} className="h-8 px-2">
                  <Car className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setShowFilters(!showFilters)} className="h-8 w-8 p-0">
                  <Filter className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsDarkMode(!isDarkMode)} className="h-8 w-8 p-0" disabled={mapStyle === 'satellite'}>
                  {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant={mapStyle === 'satellite' ? 'default' : 'ghost'} onClick={() => setMapStyle(mapStyle === 'satellite' ? 'navigation' : 'satellite')} className="h-8 w-8 p-0">
                  {mapStyle === 'satellite' ? <Map className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time Filter (shown conditionally) */}
        {showFilters && (
          <Card className="mt-2 shadow-lg border-0 bg-background/95 backdrop-blur-sm animate-fade-in">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Time Range</span>
              </div>
              <div className="flex gap-1 mb-2">
                {TIME_FILTERS.map((f) => (
                  <Button key={f.value} size="sm" variant={timeFilter === f.value ? "default" : "outline"} onClick={() => setTimeFilter(f.value as TimeFilter)} className="flex-1 text-xs h-7">
                    {f.label}
                  </Button>
                ))}
              </div>
              <div className="flex justify-around items-center text-center">
                <div><span className="text-destructive font-bold">{stats.high}</span><span className="text-xs text-muted-foreground ml-1">High</span></div>
                <div><span className="text-warning font-bold">{stats.medium}</span><span className="text-xs text-muted-foreground ml-1">Medium</span></div>
                <div><span className="text-success font-bold">{stats.low}</span><span className="text-xs text-muted-foreground ml-1">Low</span></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Route Info (shown after route is calculated) */}
        {routeInfo && routeInfo.safetyScore !== undefined && (
          <Card className={`mt-2 shadow-lg border-0 ${routeInfo.safetyScore >= 90 ? 'bg-success/10' : routeInfo.safetyScore >= 70 ? 'bg-warning/10' : 'bg-destructive/10'}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Shield className={`h-4 w-4 ${routeInfo.safetyScore >= 90 ? 'text-success' : routeInfo.safetyScore >= 70 ? 'text-warning' : 'text-destructive'}`} />
                <div className="flex-1">
                  <p className="font-semibold text-sm">{routeInfo.safetyScore >= 90 ? 'Safe Route' : routeInfo.safetyScore >= 70 ? 'Caution' : 'Be Careful'}</p>
                  <p className="text-xs text-muted-foreground">Score: {routeInfo.safetyScore}/100 • {routeInfo.distance} • {routeInfo.duration}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {routeError && (
          <Card className="mt-2 shadow-lg border-0 bg-destructive/10">
            <CardContent className="p-2">
              <p className="text-xs text-destructive">{routeError}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Selected Point Card */}
      {selectedPoint && (
        <div className="absolute bottom-24 left-4 right-4 z-[1000] animate-fade-in">
          <Card className="shadow-lg border-primary/20">
            <CardContent className="p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedPoint.report.severity === "high" ? "bg-destructive/20 text-destructive" : selectedPoint.report.severity === "medium" ? "bg-warning/20 text-warning" : "bg-success/20 text-success"}`}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{selectedPoint.report.report_type}</h3>
                    <p className="text-xs text-muted-foreground">{selectedPoint.report.location_address}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedPoint(null)} className="h-6 w-6 p-0">
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {selectedPoint.report.description && <p className="text-xs text-muted-foreground mb-2">{selectedPoint.report.description}</p>}
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-xs h-5">
                  <Clock className="h-3 w-3 mr-1" />{getTimeAgo(selectedPoint.report.created_at)}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => handleUpvote(selectedPoint.report.id)} className="h-6 text-xs px-2">
                  <ThumbsUp className="h-3 w-3 mr-1" />{selectedPoint.report.upvotes || 0}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom Navigation Card */}
      {routeInfo && (
        <div className="absolute bottom-24 left-4 right-4 z-[1000]">
          <Card className="shadow-2xl border-0 bg-background/95 backdrop-blur-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Shield className={`h-6 w-6 ${routeInfo.safetyScore !== undefined && routeInfo.safetyScore >= 90 ? 'text-success' : routeInfo.safetyScore !== undefined && routeInfo.safetyScore >= 70 ? 'text-warning' : 'text-destructive'}`} />
                <div className="flex-1">
                  <p className="font-bold text-base">{routeInfo.safetyScore !== undefined && routeInfo.safetyScore >= 90 ? 'Veilige Route' : routeInfo.safetyScore !== undefined && routeInfo.safetyScore >= 70 ? 'Let op' : 'Wees voorzichtig'}</p>
                </div>
                {routeInfo.safetyScore !== undefined && (
                  <Badge variant="outline" className="text-base font-bold px-3 py-1">
                    {routeInfo.safetyScore}/100
                  </Badge>
                )}
              </div>
              {!isNavigating ? (
                <Button size="lg" onClick={startNavigation} className="w-full h-12 text-base font-semibold mb-2">
                  <Navigation className="h-5 w-5 mr-2" />
                  Start Route
                </Button>
              ) : (
                <Button size="lg" variant="destructive" onClick={stopNavigation} className="w-full h-12 text-base font-semibold mb-2">
                  <Square className="h-5 w-5 mr-1" />
                  Stop Navigatie
                </Button>
              )}
              <p className="text-sm text-muted-foreground text-center">{routeInfo.distance} • {routeInfo.duration}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Route;
