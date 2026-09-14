-- =====================================================
-- COMPLETE DATABASE SETUP - SafeBuddy
-- Run dit bestand in Supabase Dashboard → SQL Editor
-- =====================================================

-- 1. ENABLE POSTGIS EXTENSION
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. CREATE TABLES
-- =================

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  username TEXT UNIQUE,
  email TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Buddy availability table
CREATE TABLE IF NOT EXISTS public.buddy_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  is_available BOOLEAN DEFAULT false,
  preferred_times TEXT[],
  preferred_days TEXT[],
  common_routes TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Safety reports table (MET PostGIS location!)
CREATE TABLE IF NOT EXISTS public.safety_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  location_address TEXT NOT NULL,
  location geography(point, 4326),  -- PostGIS coördinaten
  report_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  time_of_day TEXT,
  description TEXT,
  upvotes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trusted contacts table
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Map points table (14K+ datapunten)
CREATE TABLE IF NOT EXISTS public.map_points (
  id bigserial PRIMARY KEY,
  owner_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  report_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  location geography(point, 4326) NOT NULL,
  upvotes integer DEFAULT 0,
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. CREATE INDEXES
-- =================

-- Spatial indexes (voor snelle geografische queries)
CREATE INDEX IF NOT EXISTS safety_reports_location_gix ON public.safety_reports USING gist (location);
CREATE INDEX IF NOT EXISTS map_points_location_gix ON public.map_points USING gist (location);

-- Filter indexes
CREATE INDEX IF NOT EXISTS map_points_report_type_idx ON public.map_points (report_type);
CREATE INDEX IF NOT EXISTS map_points_severity_idx ON public.map_points (severity);

-- 4. ENABLE ROW LEVEL SECURITY
-- =============================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_points ENABLE ROW LEVEL SECURITY;

-- 5. CREATE RLS POLICIES
-- =======================

-- Profiles policies
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Buddy availability policies
DROP POLICY IF EXISTS "Users can view all availability" ON public.buddy_availability;
CREATE POLICY "Users can view all availability" ON public.buddy_availability FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own availability" ON public.buddy_availability;
CREATE POLICY "Users can update own availability" ON public.buddy_availability FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own availability" ON public.buddy_availability;
CREATE POLICY "Users can insert own availability" ON public.buddy_availability FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own availability" ON public.buddy_availability;
CREATE POLICY "Users can delete own availability" ON public.buddy_availability FOR DELETE USING (auth.uid() = user_id);

-- Safety reports policies
DROP POLICY IF EXISTS "Anyone can view reports" ON public.safety_reports;
CREATE POLICY "Anyone can view reports" ON public.safety_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create reports" ON public.safety_reports;
CREATE POLICY "Authenticated users can create reports" ON public.safety_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own reports" ON public.safety_reports;
CREATE POLICY "Users can update own reports" ON public.safety_reports FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own reports" ON public.safety_reports;
CREATE POLICY "Users can delete own reports" ON public.safety_reports FOR DELETE USING (auth.uid() = user_id);

-- Trusted contacts policies
DROP POLICY IF EXISTS "Users can view own contacts" ON public.trusted_contacts;
CREATE POLICY "Users can view own contacts" ON public.trusted_contacts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own contacts" ON public.trusted_contacts;
CREATE POLICY "Users can insert own contacts" ON public.trusted_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own contacts" ON public.trusted_contacts;
CREATE POLICY "Users can update own contacts" ON public.trusted_contacts FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own contacts" ON public.trusted_contacts;
CREATE POLICY "Users can delete own contacts" ON public.trusted_contacts FOR DELETE USING (auth.uid() = user_id);

-- Map points policies
DROP POLICY IF EXISTS "Anyone can view map points" ON public.map_points;
CREATE POLICY "Anyone can view map points" ON public.map_points FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create map points" ON public.map_points;
CREATE POLICY "Authenticated users can create map points" ON public.map_points FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR owner_id IS NULL);

DROP POLICY IF EXISTS "Users can update own map points" ON public.map_points;
CREATE POLICY "Users can update own map points" ON public.map_points FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own map points" ON public.map_points;
CREATE POLICY "Users can delete own map points" ON public.map_points FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 6. CREATE FUNCTIONS
-- ====================

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- New user signup handler
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get points within radius
CREATE OR REPLACE FUNCTION public.get_points_in_radius(
  lng double precision,
  lat double precision,
  radius_meters integer DEFAULT 2000
)
RETURNS TABLE (
  id bigint,
  title text,
  description text,
  report_type text,
  severity text,
  longitude double precision,
  latitude double precision,
  upvotes integer,
  is_verified boolean,
  distance_meters double precision,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.id,
    mp.title,
    mp.description,
    mp.report_type,
    mp.severity,
    ST_X(mp.location::geometry) as longitude,
    ST_Y(mp.location::geometry) as latitude,
    mp.upvotes,
    mp.is_verified,
    ST_Distance(
      mp.location,
      ST_MakePoint(lng, lat)::geography
    ) as distance_meters,
    mp.created_at
  FROM public.map_points mp
  WHERE ST_DWithin(
    mp.location,
    ST_MakePoint(lng, lat)::geography,
    radius_meters
  )
  ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get points within bounding box
CREATE OR REPLACE FUNCTION public.get_points_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
RETURNS TABLE (
  id bigint,
  title text,
  description text,
  report_type text,
  severity text,
  longitude double precision,
  latitude double precision,
  upvotes integer,
  is_verified boolean,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mp.id,
    mp.title,
    mp.description,
    mp.report_type,
    mp.severity,
    ST_X(mp.location::geometry) as longitude,
    ST_Y(mp.location::geometry) as latitude,
    mp.upvotes,
    mp.is_verified,
    mp.created_at
  FROM public.map_points mp
  WHERE mp.location && ST_MakeEnvelope(
    min_lng, min_lat,
    max_lng, max_lat,
    4326
  )::geography;
END;
$$ LANGUAGE plpgsql STABLE;

-- Upvote map point
CREATE OR REPLACE FUNCTION public.upvote_map_point(point_id bigint)
RETURNS void AS $$
BEGIN
  UPDATE public.map_points
  SET upvotes = upvotes + 1
  WHERE id = point_id;
END;
$$ LANGUAGE plpgsql;

-- Sync safety report to map point (automatisch bij nieuwe report)
CREATE OR REPLACE FUNCTION public.sync_report_to_map_point()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location IS NOT NULL THEN
    INSERT INTO public.map_points (
      owner_id,
      title,
      description,
      report_type,
      severity,
      location,
      upvotes
    )
    VALUES (
      NEW.user_id,
      NEW.report_type,
      NEW.description,
      NEW.report_type,
      NEW.severity,
      NEW.location,
      NEW.upvotes
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sync upvotes from safety_reports to map_points
CREATE OR REPLACE FUNCTION public.sync_report_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.map_points
  SET upvotes = NEW.upvotes
  WHERE owner_id = NEW.user_id
    AND report_type = NEW.report_type
    AND ST_DWithin(location, NEW.location, 10)
    AND created_at >= NEW.created_at - INTERVAL '1 minute'
    AND created_at <= NEW.created_at + INTERVAL '1 minute';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. CREATE TRIGGERS
-- ===================

-- Update timestamp triggers
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at 
  BEFORE UPDATE ON public.profiles 
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_buddy_availability_updated_at ON public.buddy_availability;
CREATE TRIGGER set_buddy_availability_updated_at 
  BEFORE UPDATE ON public.buddy_availability 
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_map_points_updated_at ON public.map_points;
CREATE TRIGGER handle_map_points_updated_at
  BEFORE UPDATE ON public.map_points
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- New user trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sync triggers
DROP TRIGGER IF EXISTS sync_safety_report_to_map ON public.safety_reports;
CREATE TRIGGER sync_safety_report_to_map
  AFTER INSERT ON public.safety_reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_report_to_map_point();

DROP TRIGGER IF EXISTS sync_report_upvotes_to_map ON public.safety_reports;
CREATE TRIGGER sync_report_upvotes_to_map
  AFTER UPDATE OF upvotes ON public.safety_reports
  FOR EACH ROW
  WHEN (OLD.upvotes IS DISTINCT FROM NEW.upvotes)
  EXECUTE FUNCTION public.sync_report_upvotes();

-- =====================================================
-- KLAAR! Database is nu compleet opgezet.
-- Test door: node check-database.js uit te voeren
-- =====================================================
