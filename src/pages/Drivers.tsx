import { DashboardLayout } from "@/components/DashboardLayout";
import { useDrivers } from "@/hooks/useDrivers";
import { useTrips } from "@/hooks/useTrips";
import { motion } from "framer-motion";
import { Users, Route as RouteIcon, TrendingUp, DollarSign } from "lucide-react";
import { useMemo } from "react";
import { getDriverColorByIndex } from "@/lib/driverColors";
import { calculateBilling, formatCurrency } from "@/lib/billing";

export default function Drivers() {
  const { data: drivers = [], isLoading } = useDrivers();
  const { data: trips = [] } = useTrips();

  const driverStats = useMemo(() => {
    const stats = new Map<string, { totalTrips: number; totalMiles: number; revenue: number }>();
    trips.forEach((t) => {
      const existing = stats.get(t.driver_name) ?? { totalTrips: 0, totalMiles: 0, revenue: 0 };
      existing.totalTrips++;
      existing.totalMiles += t.mileage ?? 0;
      if (t.status === "COMPLETED") existing.revenue += calculateBilling(t.mileage);
      stats.set(t.driver_name, existing);
    });
    return stats;
  }, [trips]);

  const sortedDrivers = useMemo(() => [...drivers].sort((a, b) => a.name.localeCompare(b.name)), [drivers]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Drivers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading..." : `${drivers.length} drivers registered`}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedDrivers.map((driver, i) => {
            const stats = driverStats.get(driver.name) ?? { totalTrips: 0, totalMiles: 0, revenue: 0 };
            const color = getDriverColorByIndex(i);
            return (
              <motion.div key={driver.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card border border-border rounded-xl p-5 space-y-4 relative overflow-hidden"
                style={{ boxShadow: "var(--shadow-card)" }}>
                {/* Color accent bar */}
                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: color.bg }} />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: color.light, color: color.text }}
                    >
                      {driver.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{driver.name}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${driver.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
                        {driver.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><RouteIcon className="h-3 w-3" /> Trips</div>
                    <p className="font-mono font-bold text-lg">{stats.totalTrips}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3 w-3" /> Miles</div>
                    <p className="font-mono font-bold text-lg">{stats.totalMiles.toFixed(1)}</p>
                  </div>
                  <div className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><DollarSign className="h-3 w-3" /> Rev</div>
                    <p className="font-mono font-bold text-sm">{formatCurrency(stats.revenue)}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
