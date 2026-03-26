
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drivers table
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read drivers" ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert drivers" ON public.drivers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update drivers" ON public.drivers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete drivers" ON public.drivers FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_drivers_updated_at
  BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trips table
CREATE TABLE public.trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  member_name TEXT NOT NULL,
  trip_number TEXT NOT NULL CHECK (trip_number IN ('A', 'B')),
  pickup_time TEXT NOT NULL,
  dropoff_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED', 'PENDING')),
  mileage NUMERIC,
  date DATE NOT NULL,
  driver_name TEXT NOT NULL,
  pickup_address TEXT,
  dropoff_address TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ocr', 'manual')),
  trip_id_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read trips" ON public.trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can insert trips" ON public.trips FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update trips" ON public.trips FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anyone can delete trips" ON public.trips FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for common queries
CREATE INDEX idx_trips_date ON public.trips (date DESC);
CREATE INDEX idx_trips_driver ON public.trips (driver_name);
CREATE INDEX idx_trips_source ON public.trips (source);
