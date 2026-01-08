import { supabase } from '@/integrations/supabase/client';

export type ReportType = 'harassment' | 'theft' | 'assault' | 'unsafe_area' | 'poor_lighting' | 'suspicious_activity' | 'other';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface MapPoint {
  id: number;
  title: string;
  description: string | null;
  report_type: ReportType;
  severity: Severity;
  longitude: number;
  latitude: number;
  upvotes: number;
  is_verified: boolean;
  created_at: string;
  distance_meters?: number;
}

export interface CreateMapPointData {
  title: string;
  description?: string;
  report_type: ReportType;
  severity: Severity;
  longitude: number;
  latitude: number;
}

/**
 * Haal alle punten op binnen een bepaalde straal (in meters)
 * Gebruik voor: "toon alle meldingen in de buurt van mijn huidige locatie"
 */
export async function getPointsInRadius(
  longitude: number,
  latitude: number,
  radiusMeters: number = 2000
): Promise<MapPoint[]> {
  const { data, error } = await supabase.rpc('get_points_in_radius', {
    lng: longitude,
    lat: latitude,
    radius_meters: radiusMeters,
  });

  if (error) {
    console.error('Error fetching points in radius:', error);
    throw error;
  }

  return data || [];
}

/**
 * Haal alle punten op binnen een bounding box (viewport van de kaart)
 * Gebruik voor: "toon alle punten die zichtbaar zijn op de kaart"
 */
export async function getPointsInBoundingBox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number
): Promise<MapPoint[]> {
  const { data, error } = await supabase.rpc('get_points_in_bbox', {
    min_lng: minLng,
    min_lat: minLat,
    max_lng: maxLng,
    max_lat: maxLat,
  });

  if (error) {
    console.error('Error fetching points in bbox:', error);
    throw error;
  }

  return data || [];
}

/**
 * Maak een nieuw punt aan op de kaart
 * Let op: location wordt automatisch omgezet naar PostGIS geography type
 */
export async function createMapPoint(pointData: CreateMapPointData) {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User must be authenticated to create map points');
  }

  // PostGIS verwacht POINT(longitude latitude) format
  const locationString = `POINT(${pointData.longitude} ${pointData.latitude})`;

  const { data, error } = await supabase
    .from('map_points')
    .insert({
      owner_id: user.id,
      title: pointData.title,
      description: pointData.description || null,
      report_type: pointData.report_type,
      severity: pointData.severity,
      location: locationString,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating map point:', error);
    throw error;
  }

  return data;
}

/**
 * Update een bestaand punt (alleen als je de eigenaar bent)
 */
export async function updateMapPoint(
  pointId: number,
  updates: Partial<CreateMapPointData>
) {
  const updateData: any = { ...updates };

  // Als locatie wordt geupdate, converteer naar PostGIS format
  if (updates.longitude !== undefined && updates.latitude !== undefined) {
    updateData.location = `POINT(${updates.longitude} ${updates.latitude})`;
    delete updateData.longitude;
    delete updateData.latitude;
  }

  const { data, error } = await supabase
    .from('map_points')
    .update(updateData)
    .eq('id', pointId)
    .select()
    .single();

  if (error) {
    console.error('Error updating map point:', error);
    throw error;
  }

  return data;
}

/**
 * Verwijder een punt (alleen als je de eigenaar bent)
 */
export async function deleteMapPoint(pointId: number) {
  const { error } = await supabase
    .from('map_points')
    .delete()
    .eq('id', pointId);

  if (error) {
    console.error('Error deleting map point:', error);
    throw error;
  }
}

/**
 * Upvote een punt
 */
export async function upvoteMapPoint(pointId: number) {
  const { error } = await supabase.rpc('upvote_map_point', {
    point_id: pointId,
  });

  if (error) {
    console.error('Error upvoting map point:', error);
    throw error;
  }
}

/**
 * Real-time subscription voor map punten in een gebied
 * Gebruik voor: live updates als er nieuwe meldingen bijkomen
 */
export function subscribeToMapPoints(
  callback: (payload: any) => void
) {
  const channel = supabase
    .channel('map_points_changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'map_points',
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Bereken afstand tussen twee coördinaten (Haversine formule)
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Format afstand voor weergave
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
