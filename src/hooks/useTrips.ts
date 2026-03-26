import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TripRow = {
  id: string;
  member_name: string;
  trip_number: string;
  pickup_time: string;
  dropoff_time: string;
  status: string;
  mileage: number | null;
  date: string;
  driver_name: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  source: string;
  trip_id_reference: string | null;
  created_at: string;
  updated_at: string;
};

export function useTrips() {
  return useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data as TripRow[];
    },
  });
}

export function useInsertTrips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      trips: Omit<TripRow, "id" | "created_at" | "updated_at">[]
    ) => {
      const { data, error } = await supabase
        .from("trips")
        .upsert(trips, {
          onConflict: "date,driver_name,member_name,trip_number,pickup_time",
          ignoreDuplicates: true,
        })
        .select();
      if (error) throw error;
      return { inserted: data, total: trips.length, duplicates: trips.length - data.length };
    },
    onSuccess: ({ inserted, total, duplicates }) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      const msg = duplicates > 0
        ? `${inserted.length} trip(s) saved, ${duplicates} duplicate(s) skipped`
        : `${inserted.length} trip(s) saved to database`;
      toast.success(msg);
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });
}

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TripRow> & { id: string }) => {
      const { error } = await supabase.from("trips").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Trip updated");
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Trip deleted");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });
}

export function useDeleteAllTrips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trips").delete().gt("created_at", "1970-01-01T00:00:00Z");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("All trip records deleted");
    },
    onError: (err) => toast.error(`Delete all failed: ${err.message}`),
  });
}