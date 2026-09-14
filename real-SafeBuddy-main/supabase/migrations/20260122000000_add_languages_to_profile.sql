-- Add languages column to profiles table
ALTER TABLE public.profiles
ADD COLUMN languages TEXT[] DEFAULT '{}';

-- Create index for faster queries
CREATE INDEX idx_profiles_languages ON public.profiles USING GIN (languages);
