-- Tijdelijk policy toevoegen voor bulk import (ALLEEN voor import, daarna verwijderen!)
CREATE POLICY "Allow anonymous bulk import" 
ON public.map_points 
FOR INSERT 
WITH CHECK (owner_id IS NULL);

-- Na import, verwijder deze policy met:
-- DROP POLICY "Allow anonymous bulk import" ON public.map_points;
