
-- Enums
CREATE TYPE public.neighborhood AS ENUM ('williamsburg', 'bushwick', 'bed_stuy', 'east_village', 'west_village', 'chelsea', 'greenpoint');
CREATE TYPE public.venue_type AS ENUM ('park', 'bar', 'cafe', 'performance_venue', 'club');
CREATE TYPE public.scrape_status AS ENUM ('not_started', 'html_scraped', 'extracted');
CREATE TYPE public.price_type AS ENUM ('free', 'cover', 'ticketed');
CREATE TYPE public.event_type AS ENUM ('live_band', 'dj', 'open_mic', 'jam_session');

-- Venues table
CREATE TABLE public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  google_maps_venue_id TEXT UNIQUE,
  address TEXT NOT NULL,
  neighborhood public.neighborhood NOT NULL,
  venue_type public.venue_type NOT NULL,
  website_url TEXT,
  calendar_url TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  scrape_status public.scrape_status NOT NULL DEFAULT 'not_started',
  raw_html_url TEXT,
  last_scraped_at TIMESTAMPTZ,
  extracted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  artist_name TEXT,
  date DATE NOT NULL,
  time_start TIME,
  time_end TIME,
  price_type public.price_type NOT NULL DEFAULT 'free',
  price_amount DECIMAL,
  description TEXT,
  event_type public.event_type NOT NULL,
  recurring BOOLEAN NOT NULL DEFAULT false,
  source_url TEXT,
  parsed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue_id, date, event_name)
);

-- Bookmarks table
CREATE TABLE public.bookmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- Enable RLS
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Venues: public read
CREATE POLICY "Venues are publicly readable" ON public.venues FOR SELECT USING (true);

-- Events: public read
CREATE POLICY "Events are publicly readable" ON public.events FOR SELECT USING (true);

-- Bookmarks: user-scoped
CREATE POLICY "Users can view own bookmarks" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own bookmarks" ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own bookmarks" ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_events_date ON public.events(date);
CREATE INDEX idx_events_venue ON public.events(venue_id);
CREATE INDEX idx_events_type ON public.events(event_type);
CREATE INDEX idx_bookmarks_user ON public.bookmarks(user_id);
CREATE INDEX idx_venues_neighborhood ON public.venues(neighborhood);
