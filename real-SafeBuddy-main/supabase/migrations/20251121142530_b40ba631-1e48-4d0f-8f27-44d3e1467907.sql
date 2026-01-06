-- Create verification documents storage bucket (private for security)
INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-documents', 'verification-documents', false);

-- Create verification status enum
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');

-- Create user_verifications table
CREATE TABLE public.user_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  id_document_url TEXT NOT NULL,
  selfie_url TEXT,
  verification_status verification_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS on user_verifications
ALTER TABLE public.user_verifications ENABLE ROW LEVEL SECURITY;

-- Users can insert their own verification
CREATE POLICY "Users can submit own verification"
ON public.user_verifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own verification status
CREATE POLICY "Users can view own verification"
ON public.user_verifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own pending verifications
CREATE POLICY "Users can update own pending verification"
ON public.user_verifications
FOR UPDATE
USING (auth.uid() = user_id AND verification_status = 'pending');

-- Storage policies for verification documents
-- Users can upload their own verification documents
CREATE POLICY "Users can upload own verification documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'verification-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own verification documents
CREATE POLICY "Users can view own verification documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'verification-documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Add verification trigger for updated_at
CREATE TRIGGER update_user_verifications_updated_at
BEFORE UPDATE ON public.user_verifications
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add verified status to profiles table
ALTER TABLE public.profiles
ADD COLUMN is_verified BOOLEAN DEFAULT false,
ADD COLUMN verification_submitted_at TIMESTAMP WITH TIME ZONE;