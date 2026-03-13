-- Phase 2: Add scrape observability columns to venues
ALTER TABLE public.venues
  ADD COLUMN scrape_error      TEXT,
  ADD COLUMN scrape_fail_count INT NOT NULL DEFAULT 0;

-- Phase 2: Scrape run log table
CREATE TABLE public.scrape_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID        REFERENCES public.venues(id) ON DELETE CASCADE,  -- nullable for batch-level logs
  workflow   TEXT        NOT NULL,  -- 'discovery' | 'html_scrape' | 'ai_parse' | 'freshness_reset'
  status     TEXT        NOT NULL,  -- 'success' | 'failure'
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX scrape_logs_venue_created_idx    ON public.scrape_logs (venue_id, created_at DESC);
CREATE INDEX scrape_logs_workflow_created_idx ON public.scrape_logs (workflow,  created_at DESC);

-- scrape_logs: service role only (no public access)
ALTER TABLE public.scrape_logs ENABLE ROW LEVEL SECURITY;
