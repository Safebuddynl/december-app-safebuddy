-- Create buddy_messages table for chat functionality
CREATE TABLE public.buddy_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.buddy_messages ENABLE ROW LEVEL SECURITY;

-- Users can view messages they sent or received
CREATE POLICY "Users can view own messages" 
ON public.buddy_messages 
FOR SELECT 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Users can send messages
CREATE POLICY "Users can send messages" 
ON public.buddy_messages 
FOR INSERT 
WITH CHECK (auth.uid() = sender_id);

-- Users can update messages they received (mark as read)
CREATE POLICY "Users can mark received messages as read" 
ON public.buddy_messages 
FOR UPDATE 
USING (auth.uid() = receiver_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.buddy_messages;

-- Create index for faster queries
CREATE INDEX idx_buddy_messages_match_id ON public.buddy_messages(match_id);
CREATE INDEX idx_buddy_messages_created_at ON public.buddy_messages(created_at);