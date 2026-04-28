-- Migration 004: Knockout / auto-reject support
-- Run in Supabase SQL Editor

-- Add knockout_reason column to interviews
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS knockout_reason TEXT;

-- Add document_interview_alignment column if not present (used by PDF report)
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS document_interview_alignment TEXT;

-- Add submitted_files and submitted_links columns if not present
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS submitted_files  JSONB DEFAULT '[]';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS submitted_links  JSONB DEFAULT '[]';

-- Expand status CHECK constraint to include auto_rejected and accepted
-- Drop old constraint first, then add expanded one
ALTER TABLE interviews DROP CONSTRAINT IF EXISTS interviews_status_check;
ALTER TABLE interviews
    ADD CONSTRAINT interviews_status_check
    CHECK (status IN (
        'in_progress',
        'completed',
        'scored',
        'shortlisted',
        'rejected',
        'accepted',
        'auto_rejected'
    ));
