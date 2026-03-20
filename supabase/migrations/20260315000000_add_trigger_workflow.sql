-- Sub-URLs identified by AI Agent 1 for each venue (calendar/events/shows pages)
ALTER TABLE public.venues ADD COLUMN sub_urls JSONB;

-- Add 'failed' to scrape_status enum (scripts already cast this value as a string)
ALTER TYPE public.scrape_status ADD VALUE IF NOT EXISTS 'failed';

-- Index for scheduled scrape query (find not_started venues fast)
CREATE INDEX IF NOT EXISTS idx_venues_scrape_status ON public.venues (scrape_status);
