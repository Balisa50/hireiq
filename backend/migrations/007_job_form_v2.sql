-- Migration 007: Job Form v2 — extended fields for new frictionless job creation flow
-- Run in Supabase SQL editor

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_code               TEXT,
  ADD COLUMN IF NOT EXISTS hiring_manager         TEXT,
  ADD COLUMN IF NOT EXISTS relocation_considered  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS travel_required        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS equity_offered         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS benefits_summary       TEXT,
  ADD COLUMN IF NOT EXISTS nice_to_have_skills    JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS eligibility_criteria   JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS candidate_info_config  JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS dei_config             JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS ai_deterrent_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ai_deterrent_placement TEXT NOT NULL DEFAULT 'before_questions',
  ADD COLUMN IF NOT EXISTS ai_deterrent_message   TEXT;

-- Make focus_areas nullable / defaulting to empty array (no longer required)
ALTER TABLE jobs
  ALTER COLUMN focus_areas SET DEFAULT '[]'::JSONB;

COMMENT ON COLUMN jobs.eligibility_criteria   IS 'JSON: min_education, min_experience_years, required_certifications, min_gpa, work_auth_required, required_languages';
COMMENT ON COLUMN jobs.candidate_info_config   IS 'JSON: collect_phone, collect_date_of_birth, collect_nationality, collect_current_location, collect_employment_history, collect_education_history, collect_references';
COMMENT ON COLUMN jobs.dei_config              IS 'JSON: enabled, collect_ethnicity, collect_gender, collect_disability, collect_veteran';
COMMENT ON COLUMN jobs.ai_deterrent_placement  IS 'One of: at_start | before_questions | after_questions';
