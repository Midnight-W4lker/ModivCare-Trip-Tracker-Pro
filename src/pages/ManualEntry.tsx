import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDrivers } from "@/hooks/useDrivers";
import { useInsertTrips } from "@/hooks/useTrips";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { PenLine, Save } from "lucide-react";

export default function ManualEntry() {
  const { data: drivers = [] } = useDrivers();
  const insertTrips = useInsertTrips();

  const [form, setForm] = useState({
    memberName: "", tripNumber: "A", pickupTime: "", dropoffTime: "",
    mileage: "", date: "", driverName: "", pickupAddress: "", dropoffAddress: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.memberName || !form.pickupTime || !form.dropoffTime || !form.date || !form.driverName) {
      toast.error("Please fill in all required fields");
      return;
    }
    insertTrips.mutate([{
      member_name: form.memberName,
      trip_number: form.tripNumber,
      pickup_time: form.pickupTime,
      dropoff_time: form.dropoffTime,
      mileage: form.mileage ? parseFloat(form.mileage) : null,
      date: form.date,
      driver_name: form.driverName,
      pickup_address: form.pickupAddress || null,
      dropoff_address: form.dropoffAddress || null,
      source: "manual",
      status: "COMPLETED",
      trip_id_reference: null,
    }]);
    setForm({ memberName: "", tripNumber: "A", pickupTime: "", dropoffTime: "", mileage: "", date: "", driverName: "", pickupAddress: "", dropoffAddress: "" });
  };

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <DashboardLayout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            Manual Trip Entry
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Record trips that weren't captured via screenshot</p>
        </div>

        <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={handleSubmit}
          className="bg-card border border-border rounded-xl p-6 space-y-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Member Name *</Label>
              <Input placeholder="Last, First" value={form.memberName} onChange={(e) => update("memberName", e.target.value)} className="capitalize" />
            </div>
            <div className="space-y-2">
              <Label>Trip Number *</Label>
              <Select value={form.tripNumber} onValueChange={(v) => update("tripNumber", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Trip A</SelectItem>
                  <SelectItem value="B">Trip B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Driver *</Label>
              <Select value={form.driverName} onValueChange={(v) => update("driverName", v)}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {drivers.filter(d => d.status === "active").map((d) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pick-up Time *</Label>
              <Input type="time" value={form.pickupTime} onChange={(e) => update("pickupTime", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Drop-off Time *</Label>
              <Input type="time" value={form.dropoffTime} onChange={(e) => update("dropoffTime", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mileage</Label>
              <Input type="number" step="0.1" placeholder="0.0" value={form.mileage} onChange={(e) => update("mileage", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pick-up Address</Label>
              <Input placeholder="123 Main St" value={form.pickupAddress} onChange={(e) => update("pickupAddress", e.target.value)} className="capitalize" />
            </div>
            <div className="space-y-2">
              <Label>Drop-off Address</Label>
              <Input placeholder="456 Hospital Dr" value={form.dropoffAddress} onChange={(e) => update("dropoffAddress", e.target.value)} className="capitalize" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={insertTrips.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {insertTrips.isPending ? "Saving..." : "Save Trip Entry"}
          </Button>
        </motion.form>
      </div>
    </DashboardLayout>
  );
}
