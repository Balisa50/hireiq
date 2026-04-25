-- HireIQ Database Schema
-- Run this in Supabase SQL Editor to initialize the database
-- Author: HireIQ Engineering

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── companies ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 TEXT UNIQUE NOT NULL,
    company_name          TEXT NOT NULL,
    industry              TEXT,
    company_size          TEXT,
    website_url           TEXT,
    logo_url              TEXT,
    default_question_count INTEGER DEFAULT 8,
    default_focus_areas   TEXT[] DEFAULT ARRAY['Technical Skills', 'Problem Solving', 'Communication'],
    custom_intro_message  TEXT,
    email_notifications   BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── jobs ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title                 TEXT NOT NULL,
    department            TEXT,
    location              TEXT,
    employment_type       TEXT,
    job_description       TEXT NOT NULL,
    question_count        INTEGER DEFAULT 8,
    focus_areas           TEXT[],
    questions             JSONB DEFAULT '[]',
    interview_link_token  UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    status                TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── interviews ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id                          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    company_id                      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    candidate_name                  TEXT NOT NULL,
    candidate_email                 TEXT NOT NULL,
    transcript                      JSONB DEFAULT '[]',
    overall_score                   INTEGER,
    score_breakdown                 JSONB,
    executive_summary               TEXT,
    key_strengths                   TEXT[],
    areas_of_concern                TEXT[],
    recommended_follow_up_questions TEXT[],
    hiring_recommendation           TEXT,
    status                          TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'scored', 'shortlisted', 'rejected')),
    started_at                      TIMESTAMPTZ DEFAULT NOW(),
    completed_at                    TIMESTAMPTZ,
    last_saved_at                   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes for performance ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_company_id          ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_link_token          ON jobs(interview_link_token);
CREATE INDEX IF NOT EXISTS idx_jobs_status              ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_interviews_company_id    ON interviews(company_id);
CREATE INDEX IF NOT EXISTS idx_interviews_job_id        ON interviews(job_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status        ON interviews(status);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate_email ON interviews(candidate_email);

-- ── updated_at triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- companies: each company reads/writes only their own row
CREATE POLICY "companies_own_row" ON companies
    FOR ALL USING (auth.uid() = id);

-- jobs: company reads/writes only their own jobs
CREATE POLICY "jobs_own_company" ON jobs
    FOR ALL USING (
        company_id = auth.uid()
    );

-- interviews: company reads interviews for their own jobs
CREATE POLICY "interviews_own_company" ON interviews
    FOR ALL USING (
        company_id = auth.uid()
    );

-- Public read for interview link lookup (unauthenticated candidates need to load job info)
CREATE POLICY "jobs_public_link_lookup" ON jobs
    FOR SELECT USING (
        status = 'active'
    );

-- Candidates can insert/update their own interview row using the link token
-- (server side verifies the token before inserting — the API handles auth for candidates)
CREATE POLICY "interviews_candidate_insert" ON interviews
    FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "interviews_candidate_update_own" ON interviews
    FOR UPDATE USING (TRUE);

-- ── Service role bypass (for backend API) ─────────────────────────────────────
-- The backend uses the service role key which bypasses RLS
-- RLS above applies only to direct Supabase client (frontend) calls
