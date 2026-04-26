-- Migration 003: Additional job fields
-- Run in Supabase SQL Editor

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS experience_level  TEXT    DEFAULT 'any';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_arrangement  TEXT    DEFAULT 'on_site';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS openings          INTEGER DEFAULT 1;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills            TEXT[]  DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_min        INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_max        INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_currency   TEXT    DEFAULT 'USD';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_period     TEXT    DEFAULT 'year';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_disclosed  BOOLEAN DEFAULT true;
