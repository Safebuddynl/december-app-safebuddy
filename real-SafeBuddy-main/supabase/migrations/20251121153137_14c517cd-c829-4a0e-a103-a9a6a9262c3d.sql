-- First, clean up duplicate records, keeping only the most recent one for each user
DELETE FROM public.buddy_availability 
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as row_num
    FROM public.buddy_availability
  ) t
  WHERE t.row_num > 1
);

-- Now add unique constraint on user_id to ensure only one availability record per user
ALTER TABLE public.buddy_availability 
ADD CONSTRAINT buddy_availability_user_id_key UNIQUE (user_id);