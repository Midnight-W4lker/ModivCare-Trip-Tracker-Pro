import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useTrips, useDeleteTrip, useUpdateTrip, TripRow } from "@/hooks/useTrips";
import { useDrivers, useDeleteDriver, useInsertDriver, DriverRow } from "@/hooks/useDrivers";
import { DriverCombobox } from "@/components/DriverCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getDriverColor } from "@/lib/driverColors";
import { Trash2, Pencil, Plus, Search, Database } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

function TripEditDialog({ trip, allDriverNames, onSave }: { trip: TripRow; allDriverNames: string[]; onSave: (updates: Partial<TripRow>) => void }) {
  const [form, setForm] = useState({
    member_name: trip.member_name,
    trip_number: trip.trip_number,
    pickup_time: trip.pickup_time,
    dropoff_time: trip.dropoff_time,
    mileage: trip.mileage?.toString() ?? "",
    date: trip.date,
    driver_name: trip.driver_name,
    status: trip.status,
    pickup_address: trip.pickup_address ?? "",
    dropoff_address: trip.dropoff_address ?? "",
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Trip</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Member Name</Label>
          <Input value={form.member_name} onChange={(e) => setForm(p => ({ ...p, member_name: e.target.value }))} className="capitalize" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Driver</Label>
          <DriverCombobox value={form.driver_name} onChange={(v) => setForm(p => ({ ...p, driver_name: v }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trip #</Label>
          <Select value={form.trip_number} onValueChange={(v) => setForm(p => ({ ...p, trip_number: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">PU Time</Label>
          <Input type="time" value={form.pickup_time} onChange={(e) => setForm(p => ({ ...p, pickup_time: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">DO Time</Label>
          <Input type="time" value={form.dropoff_time} onChange={(e) => setForm(p => ({ ...p, dropoff_time: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Mileage</Label>
          <Input type="number" step="0.1" value={form.mileage} onChange={(e) => setForm(p => ({ ...p, mileage: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPLETED">COMPLETED</SelectItem>
              <SelectItem value="CANCELLED">CANCELLED</SelectItem>
              <SelectItem value="PENDING">PENDING</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">PU Address</Label>
          <Input value={form.pickup_address} onChange={(e) => setForm(p => ({ ...p, pickup_address: e.target.value }))} className="capitalize" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">DO Address</Label>
          <Input value={form.dropoff_address} onChange={(e) => setForm(p => ({ ...p, dropoff_address: e.target.value }))} className="capitalize" />
        </div>
      </div>
      <Button onClick={() => onSave({
        member_name: form.member_name,
        trip_number: form.trip_number,
        pickup_time: form.pickup_time,
        dropoff_time: form.dropoff_time,
        mileage: form.mileage ? parseFloat(form.mileage) : null,
        date: form.date,
        driver_name: form.driver_name,
        status: form.status,
        pickup_address: form.pickup_address || null,
        dropoff_address: form.dropoff_address || null,
      })} className="w-full mt-2">
        Save Changes
      </Button>
    </DialogContent>
  );
}

export default function AdminPanel() {
  const { data: trips = [], isLoading: tripsLoading } = useTrips();
  const { data: drivers = [], isLoading: driversLoading } = useDrivers();
  const deleteTrip = useDeleteTrip();
  const updateTrip = useUpdateTrip();
  const deleteDriver = useDeleteDriver();
  const insertDriver = useInsertDriver();
  const [search, setSearch] = useState("");
  const [newDriverName, setNewDriverName] = useState("");
  const [editingTrip, setEditingTrip] = useState<TripRow | null>(null);

  const allDriverNames = drivers.map((d) => d.name);

  const filteredTrips = trips.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.member_name.toLowerCase().includes(q) || t.driver_name.toLowerCase().includes(q) || t.date.includes(q);
  });

  const filteredDrivers = drivers.filter((d) => {
    if (!search) return true;
    return d.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Admin Panel
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage database records — edit, update, and delete
            </p>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <Tabs defaultValue="trips">
          <TabsList>
            <TabsTrigger value="trips">Trips ({trips.length})</TabsTrigger>
            <TabsTrigger value="drivers">Drivers ({drivers.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="trips" className="mt-4">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Member</th><th>Trip</th><th>PU</th><th>DO</th>
                      <th>Miles</th><th>Driver</th><th>Source</th><th>Status</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tripsLoading ? (
                      <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                    ) : filteredTrips.map((trip) => {
                      const dColor = getDriverColor(trip.driver_name, allDriverNames);
                      return (
                        <tr key={trip.id}>
                          <td>{trip.date}</td>
                          <td className="font-sans font-medium text-foreground">{trip.member_name}</td>
                          <td><span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold">{trip.trip_number}</span></td>
                          <td>{trip.pickup_time}</td>
                          <td>{trip.dropoff_time}</td>
                          <td>{trip.mileage ?? "—"}</td>
                          <td>
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                              style={{ backgroundColor: dColor.light, color: dColor.text }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dColor.bg }} />
                              {trip.driver_name}
                            </span>
                          </td>
                          <td><span className={`text-xs px-2 py-0.5 rounded ${trip.source === "ocr" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>{trip.source === "ocr" ? "OCR" : "Manual"}</span></td>
                          <td><span className={trip.status === "COMPLETED" ? "status-completed" : trip.status === "CANCELLED" ? "status-cancelled" : "status-pending"}>{trip.status}</span></td>
                          <td>
                            <div className="flex gap-1">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTrip(trip)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </DialogTrigger>
                                {editingTrip?.id === trip.id && (
                                  <TripEditDialog trip={trip} allDriverNames={allDriverNames} onSave={(updates) => {
                                    updateTrip.mutate({ id: trip.id, ...updates });
                                    setEditingTrip(null);
                                  }} />
                                )}
                              </Dialog>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => { if (confirm("Delete this trip?")) deleteTrip.mutate(trip.id); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!tripsLoading && filteredTrips.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">No trips found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="drivers" className="mt-4 space-y-4">
            <div className="flex gap-2">
              <Input placeholder="New driver name (Last, First)" value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} className="max-w-xs capitalize" />
              <Button onClick={() => {
                if (!newDriverName.trim()) { toast.error("Enter a driver name"); return; }
                insertDriver.mutate({ name: newDriverName.trim() });
                setNewDriverName("");
              }}>
                <Plus className="h-4 w-4 mr-1" /> Add Driver
              </Button>
            </div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-border rounded-xl overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr><th>Name</th><th>Status</th><th>Added</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {driversLoading ? (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                    ) : filteredDrivers.map((d) => {
                      const dc = getDriverColor(d.name, allDriverNames);
                      return (
                        <tr key={d.id}>
                          <td>
                            <span
                              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                              style={{ backgroundColor: dc.light, color: dc.text }}
                            >
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dc.bg }} />
                              {d.name}
                            </span>
                          </td>
                          <td><span className={d.status === "active" ? "status-completed" : "status-cancelled"}>{d.status}</span></td>
                          <td>{new Date(d.created_at).toLocaleDateString()}</td>
                          <td>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm(`Delete ${d.name}?`)) deleteDriver.mutate(d.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!driversLoading && filteredDrivers.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No drivers found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
