-- Create buddy_matches table for storing match requests and connections
CREATE TABLE public.buddy_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(requester_id, receiver_id)
);

-- Enable RLS
ALTER TABLE public.buddy_matches ENABLE ROW LEVEL SECURITY;

-- Users can view their own match requests (sent or received)
CREATE POLICY "Users can view own matches"
ON public.buddy_matches
FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

-- Users can send match requests
CREATE POLICY "Users can send match requests"
ON public.buddy_matches
FOR INSERT
WITH CHECK (auth.uid() = requester_id);

-- Users can update matches they received
CREATE POLICY "Users can update received matches"
ON public.buddy_matches
FOR UPDATE
USING (auth.uid() = receiver_id);

-- Create index for faster queries
CREATE INDEX idx_buddy_matches_requester ON public.buddy_matches(requester_id);
CREATE INDEX idx_buddy_matches_receiver ON public.buddy_matches(receiver_id);
CREATE INDEX idx_buddy_matches_status ON public.buddy_matches(status);