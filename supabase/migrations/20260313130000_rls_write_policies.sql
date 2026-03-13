-- Allow writes from the publishable key (scripts + cron jobs)
CREATE POLICY "Anyone can write venues" ON public.venues FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can write events" ON public.events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can write scrape_logs" ON public.scrape_logs FOR ALL USING (true) WITH CHECK (true);
