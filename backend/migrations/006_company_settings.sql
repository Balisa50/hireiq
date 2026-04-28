-- Migration 006: Extended company settings fields
-- Run in Supabase SQL editor

ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone           TEXT         NOT NULL DEFAULT 'UTC';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS language           TEXT         NOT NULL DEFAULT 'en';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sender_name        TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS reply_to_email     TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_footer       TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_signature    TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_severity   TEXT         NOT NULL DEFAULT 'standard';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_close_on_limit BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_deadline_days INTEGER;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS data_retention_days INTEGER     NOT NULL DEFAULT 365;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS brand_color        TEXT         NOT NULL DEFAULT '#1A1714';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS closing_message    TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_on_application  BOOLEAN  NOT NULL DEFAULT TRUE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_on_scored       BOOLEAN  NOT NULL DEFAULT TRUE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_daily_digest    BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_weekly_summary  BOOLEAN  NOT NULL DEFAULT FALSE;
