import { DashboardLayout } from "@/components/DashboardLayout";
import { TripsTable } from "@/components/TripsTable";
import { ExportTripsDialog } from "@/components/ExportTripsDialog";
import { useTrips, useDeleteAllTrips } from "@/hooks/useTrips";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AllTrips() {
  const { data: trips = [], isLoading } = useTrips();
  const deleteAll = useDeleteAllTrips();
  const [search, setSearch] = useState("");

  const displayTrips = useMemo(() => {
    const mapped = trips.map((t) => ({
      id: t.id,
      memberName: t.member_name,
      tripNumber: t.trip_number,
      pickupTime: t.pickup_time,
      dropoffTime: t.dropoff_time,
      status: t.status as "COMPLETED" | "CANCELLED" | "PENDING",
      mileage: t.mileage,
      date: t.date,
      driverName: t.driver_name,
      pickupAddress: t.pickup_address ?? undefined,
      dropoffAddress: t.dropoff_address ?? undefined,
      source: t.source as "ocr" | "manual",
      createdAt: t.created_at,
    }));
    if (!search) return mapped;
    const q = search.toLowerCase();
    return mapped.filter(
      (t) => t.memberName.toLowerCase().includes(q) || t.driverName.toLowerCase().includes(q) || t.date.includes(q)
    );
  }, [trips, search]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">All Trips</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Loading..." : `${trips.length} total trips recorded`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={trips.length === 0}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All Records
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all trip records?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {trips.length} trip records. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteAll.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteAll.isPending ? "Deleting..." : "Delete All"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <ExportTripsDialog trips={trips} />
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search trips..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </div>
        <TripsTable trips={displayTrips} title="Trip Records" />
      </div>
    </DashboardLayout>
  );
}
