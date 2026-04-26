-- HireIQ Migration 002: Document & Link Collection System
-- Run this in the Supabase SQL editor before deploying backend changes.

-- 1. Jobs table: store per-job candidate requirements
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS candidate_requirements JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Interviews table: store submitted materials + AI context
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS submitted_files       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_links       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS candidate_context     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS document_interview_alignment TEXT;

-- 3. Create the private storage bucket for candidate documents.
--    Run this separately via the Supabase Dashboard → Storage → New Bucket:
--      Name: interview-documents
--      Public: OFF
--    Then apply the RLS policies below.

-- 4. Storage RLS: only the owning company can read files from their interviews
--    (Paste into SQL editor after creating the bucket)
--
-- CREATE POLICY "Company reads own interview files"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'interview-documents'
--     AND (storage.foldername(name))[1] IN (
--       SELECT id::text FROM jobs WHERE company_id = auth.uid()::uuid
--     )
--   );
