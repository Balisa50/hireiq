-- Migration 005: Job-level controls
-- Application deadline, application limit, and pause/resume

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_deadline DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_limit   INTEGER DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_paused           BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN jobs.application_deadline IS 'Auto-closes job on this date (NULL = no deadline)';
COMMENT ON COLUMN jobs.application_limit    IS 'Max applications before auto-closing (0 = unlimited)';
COMMENT ON COLUMN jobs.is_paused            IS 'When true, new applications are blocked but job is not closed';
