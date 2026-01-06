-- Add start and destination location fields to buddy_availability
ALTER TABLE buddy_availability
ADD COLUMN start_location TEXT,
ADD COLUMN destination_location TEXT,
ADD COLUMN start_lat DOUBLE PRECISION,
ADD COLUMN start_lng DOUBLE PRECISION,
ADD COLUMN dest_lat DOUBLE PRECISION,
ADD COLUMN dest_lng DOUBLE PRECISION;