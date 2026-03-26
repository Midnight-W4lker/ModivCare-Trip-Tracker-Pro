-- Remove duplicate trips, keeping only the oldest entry per unique combo
DELETE FROM public.trips
WHERE id NOT IN (
  SELECT DISTINCT ON (date, driver_name, member_name, trip_number, pickup_time) id
  FROM public.trips
  ORDER BY date, driver_name, member_name, trip_number, pickup_time, created_at ASC
);

-- Now create the unique index
CREATE UNIQUE INDEX idx_trips_dedup ON public.trips (date, driver_name, member_name, trip_number, pickup_time);
