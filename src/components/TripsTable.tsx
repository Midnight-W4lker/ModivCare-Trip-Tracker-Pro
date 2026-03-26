import { Trip } from "@/types/trips";
import { motion } from "framer-motion";
import { calculateBilling, formatCurrency } from "@/lib/billing";
import { getDriverColor, getTripTypeColor } from "@/lib/driverColors";
import { useMemo } from "react";

interface TripsTableProps {
  trips: Trip[];
  title?: string;
}

export function TripsTable({ trips, title }: TripsTableProps) {
  const allDriverNames = useMemo(
    () => [...new Set(trips.map((t) => t.driverName))],
    [trips]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl overflow-hidden"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {title && (
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Member</th>
              <th>Trip</th>
              <th>PU Time</th>
              <th>DO Time</th>
              <th>Miles</th>
              <th>Billing</th>
              <th>Driver</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => {
              const driverColor = getDriverColor(trip.driverName, allDriverNames);
              const tripColor = getTripTypeColor(trip.tripNumber);
              const billing = calculateBilling(trip.mileage);

              return (
                <tr key={trip.id}>
                  <td>{trip.date}</td>
                  <td className="font-sans font-medium text-foreground">{trip.memberName}</td>
                  <td>
                    <span
                      className="px-2 py-0.5 rounded text-xs font-semibold"
                      style={{ backgroundColor: tripColor.light, color: tripColor.text }}
                    >
                      {trip.tripNumber}
                    </span>
                  </td>
                  <td>{trip.pickupTime}</td>
                  <td>{trip.dropoffTime}</td>
                  <td>{trip.mileage ?? "—"}</td>
                  <td className="font-mono font-medium">{billing > 0 ? formatCurrency(billing) : "—"}</td>
                  <td>
                    <div className="flex items-center gap-2 font-sans">
                      <div
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: driverColor.bg }}
                      />
                      {trip.driverName}
                    </div>
                  </td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded ${trip.source === "ocr" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                      {trip.source === "ocr" ? "OCR" : "Manual"}
                    </span>
                  </td>
                  <td>
                    <span className={trip.status === "COMPLETED" ? "status-completed" : trip.status === "CANCELLED" ? "status-cancelled" : "status-pending"}>
                      {trip.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {trips.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-muted-foreground py-8 font-sans">
                  No trips found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
