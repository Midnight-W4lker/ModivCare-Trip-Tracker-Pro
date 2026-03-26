
DROP POLICY "Anyone can delete trips" ON public.trips;
DROP POLICY "Anyone can insert trips" ON public.trips;
DROP POLICY "Anyone can read trips" ON public.trips;
DROP POLICY "Anyone can update trips" ON public.trips;
DROP POLICY "Anyone can delete drivers" ON public.drivers;
DROP POLICY "Anyone can insert drivers" ON public.drivers;
DROP POLICY "Anyone can read drivers" ON public.drivers;
DROP POLICY "Anyone can update drivers" ON public.drivers;

CREATE POLICY "Anyone can read trips" ON public.trips FOR SELECT USING (true);
CREATE POLICY "Anyone can insert trips" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update trips" ON public.trips FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete trips" ON public.trips FOR DELETE USING (true);

CREATE POLICY "Anyone can read drivers" ON public.drivers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert drivers" ON public.drivers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update drivers" ON public.drivers FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete drivers" ON public.drivers FOR DELETE USING (true);
