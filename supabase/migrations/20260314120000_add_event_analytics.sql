-- Event analytics table: aggregate engagement counts per event
CREATE TABLE public.event_analytics (
  event_id          UUID        PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  views             INT         NOT NULL DEFAULT 0,
  source_url_clicks INT         NOT NULL DEFAULT 0,
  upvotes           INT         NOT NULL DEFAULT 0,
  downvotes         INT         NOT NULL DEFAULT 0,
  last_viewed_at    TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.event_analytics ENABLE ROW LEVEL SECURITY;

-- Public read (same pattern as events/venues)
CREATE POLICY "Event analytics are publicly readable" ON public.event_analytics FOR SELECT USING (true);

-- Writes via RPC only (functions defined below use SECURITY DEFINER)
-- No direct INSERT/UPDATE/DELETE from the client

-- Index for trending queries
CREATE INDEX idx_event_analytics_last_viewed ON public.event_analytics(last_viewed_at DESC NULLS LAST);

-- RPC: increment_event_view
CREATE OR REPLACE FUNCTION public.increment_event_view(p_event_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.event_analytics (event_id, views, last_viewed_at, updated_at)
  VALUES (p_event_id, 1, now(), now())
  ON CONFLICT (event_id) DO UPDATE
    SET views          = event_analytics.views + 1,
        last_viewed_at = now(),
        updated_at     = now();
$$;

-- RPC: increment_source_url_click
CREATE OR REPLACE FUNCTION public.increment_source_url_click(p_event_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.event_analytics (event_id, source_url_clicks, updated_at)
  VALUES (p_event_id, 1, now())
  ON CONFLICT (event_id) DO UPDATE
    SET source_url_clicks = event_analytics.source_url_clicks + 1,
        updated_at        = now();
$$;

-- RPC: increment_event_upvote
CREATE OR REPLACE FUNCTION public.increment_event_upvote(p_event_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.event_analytics (event_id, upvotes, updated_at)
  VALUES (p_event_id, 1, now())
  ON CONFLICT (event_id) DO UPDATE
    SET upvotes    = event_analytics.upvotes + 1,
        updated_at = now();
$$;

-- RPC: increment_event_downvote
CREATE OR REPLACE FUNCTION public.increment_event_downvote(p_event_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO public.event_analytics (event_id, downvotes, updated_at)
  VALUES (p_event_id, 1, now())
  ON CONFLICT (event_id) DO UPDATE
    SET downvotes  = event_analytics.downvotes + 1,
        updated_at = now();
$$;
