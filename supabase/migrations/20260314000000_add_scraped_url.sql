-- Store the actual URL that was fetched during html-scrape (may differ from website_url)
ALTER TABLE public.venues ADD COLUMN scraped_url TEXT;
