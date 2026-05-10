-- Convert neighborhood column from enum to text so the discovery pipeline
-- can store any neighborhood returned by the Places API, not just the original 7.

ALTER TABLE public.venues
  ALTER COLUMN neighborhood TYPE text USING neighborhood::text;

DROP TYPE public.neighborhood;
