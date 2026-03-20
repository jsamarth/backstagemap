ALTER TYPE public.scrape_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE public.scrape_status ADD VALUE IF NOT EXISTS 'no_events';
