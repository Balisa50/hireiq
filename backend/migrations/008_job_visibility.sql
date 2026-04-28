-- Migration 008: Job Visibility
-- Adds job_visibility column to control public listing behaviour
-- Run in Supabase SQL editor

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_visibility TEXT NOT NULL DEFAULT 'public';

-- Valid values: 'public' | 'internal' | 'unlisted'
COMMENT ON COLUMN jobs.job_visibility IS 'Controls listing visibility: public = on public job board, internal = link-only for employees, unlisted = link-only not on public board';
