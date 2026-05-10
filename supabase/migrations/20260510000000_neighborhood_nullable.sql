-- Allow venues with no neighborhood from the Places API to be stored.
-- These venues still appear on the map but are excluded from the neighborhood filter.
ALTER TABLE public.venues
  ALTER COLUMN neighborhood DROP NOT NULL;
