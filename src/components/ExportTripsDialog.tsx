import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Download } from "lucide-react";
import { TripRow } from "@/hooks/useTrips";
import { toast } from "sonner";

function calcBilling(mileage: number | null): string {
  if (mileage == null || mileage <= 0) return "";
  if (mileage <= 10) return "35.00";
  return (35 + (mileage - 10) * 2.25).toFixed(2);
}

const FIELD_OPTIONS = [
  { key: "date", label: "Date" },
  { key: "member_name", label: "Member" },
  { key: "trip_number", label: "Trip" },
  { key: "pickup_time", label: "PU Time" },
  { key: "dropoff_time", label: "DO Time" },
  { key: "mileage", label: "Miles" },
  { key: "driver_name", label: "Driver" },
  { key: "billing", label: "Billing ($)" },
  { key: "status", label: "Status" },
  { key: "pickup_address", label: "Pickup Address" },
  { key: "dropoff_address", label: "Dropoff Address" },
  { key: "source", label: "Source" },
  { key: "trip_id_reference", label: "Trip ID Reference" },
] as const;

type FieldKey = (typeof FIELD_OPTIONS)[number]["key"];

const DEFAULT_SELECTED: FieldKey[] = [
  "date", "member_name", "trip_number", "pickup_time", "dropoff_time", "mileage", "driver_name",
];

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getFieldValue(trip: TripRow, key: FieldKey): string | number | null {
  if (key === "billing") return calcBilling(trip.mileage);
  return trip[key as keyof TripRow] as string | number | null;
}

export function ExportTripsDialog({ trips }: { trips: TripRow[] }) {
  const [selected, setSelected] = useState<Set<FieldKey>>(new Set(DEFAULT_SELECTED));
  const [open, setOpen] = useState(false);

  const toggle = (key: FieldKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === FIELD_OPTIONS.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(FIELD_OPTIONS.map((f) => f.key)));
    }
  };

  const handleExport = () => {
    const fields = FIELD_OPTIONS.filter((f) => selected.has(f.key));
    if (fields.length === 0) {
      toast.error("Select at least one field");
      return;
    }

    const header = fields.map((f) => f.label).join(",");
    const rows = trips.map((t) =>
      fields.map((f) => escapeCsv(getFieldValue(t, f.key))).join(",")
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modivcare-trips-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${trips.length} trips (${fields.length} fields)`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Trips to CSV</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Billing: $35 flat (1–10 mi) + $2.25/mi after 10
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selected.size} of {FIELD_OPTIONS.length} fields
            </span>
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.size === FIELD_OPTIONS.length ? "Deselect All" : "Select All"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {FIELD_OPTIONS.map((f) => (
              <label
                key={f.key}
                className="flex items-center gap-2 text-sm cursor-pointer hover:text-foreground text-muted-foreground transition-colors"
              >
                <Checkbox
                  checked={selected.has(f.key)}
                  onCheckedChange={() => toggle(f.key)}
                />
                {f.label}
              </label>
            ))}
          </div>
          <Button onClick={handleExport} className="w-full" disabled={trips.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export {trips.length} Trips
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
