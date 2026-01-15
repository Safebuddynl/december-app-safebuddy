-- Create report_likes table to track who liked what
CREATE TABLE IF NOT EXISTS public.report_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL,
  report_source TEXT NOT NULL CHECK (report_source IN ('safety_reports', 'map_points')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, report_id, report_source)
);

-- Enable RLS
ALTER TABLE public.report_likes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all likes
CREATE POLICY "Users can view all likes"
  ON public.report_likes
  FOR SELECT
  USING (true);

-- Policy: Users can insert their own likes
CREATE POLICY "Users can insert their own likes"
  ON public.report_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own likes (for unlike functionality)
CREATE POLICY "Users can delete their own likes"
  ON public.report_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_report_likes_user_id ON public.report_likes(user_id);
CREATE INDEX idx_report_likes_report ON public.report_likes(report_id, report_source);
