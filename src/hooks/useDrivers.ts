import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type DriverRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as DriverRow[];
    },
  });
}

export function useInsertDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (driver: { name: string; status?: string }) => {
      const { data, error } = await supabase.from("drivers").insert(driver).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      toast.success("Driver added");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DriverRow> & { id: string }) => {
      const { error } = await supabase.from("drivers").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      toast.success("Driver updated");
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      toast.success("Driver deleted");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });
}
