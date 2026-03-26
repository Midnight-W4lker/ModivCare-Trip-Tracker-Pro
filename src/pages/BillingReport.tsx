import { DashboardLayout } from "@/components/DashboardLayout";
import { useTrips } from "@/hooks/useTrips";
import { useDrivers } from "@/hooks/useDrivers";
import { calculateBilling, formatCurrency } from "@/lib/billing";
import { getDriverColor } from "@/lib/driverColors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, DollarSign, TrendingUp, Users, Route as RouteIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, PieChart, Pie, LineChart, Line } from "recharts";
import { toast } from "sonner";

export default function BillingReport() {
  const { data: trips = [] } = useTrips();
  const { data: drivers = [] } = useDrivers();
  const [driverFilter, setDriverFilter] = useState<string>("all");

  const allDriverNames = useMemo(() => [...new Set(trips.map((t) => t.driver_name))].sort(), [trips]);

  const filtered = useMemo(() => {
    const completed = trips.filter((t) => t.status === "COMPLETED");
    if (driverFilter === "all") return completed;
    return completed.filter((t) => t.driver_name === driverFilter);
  }, [trips, driverFilter]);

  // Summary stats
  const totalRevenue = filtered.reduce((s, t) => s + calculateBilling(t.mileage), 0);
  const totalMiles = filtered.reduce((s, t) => s + (t.mileage ?? 0), 0);
  const avgPerTrip = filtered.length > 0 ? totalRevenue / filtered.length : 0;

  // Per-driver breakdown
  const driverBreakdown = useMemo(() => {
    const map = new Map<string, { trips: number; miles: number; revenue: number; flatTrips: number; overTrips: number }>();
    filtered.forEach((t) => {
      const e = map.get(t.driver_name) ?? { trips: 0, miles: 0, revenue: 0, flatTrips: 0, overTrips: 0 };
      e.trips++;
      e.miles += t.mileage ?? 0;
      e.revenue += calculateBilling(t.mileage);
      if ((t.mileage ?? 0) <= 10) e.flatTrips++;
      else e.overTrips++;
      map.set(t.driver_name, e);
    });
    return Array.from(map.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
        color: getDriverColor(name, allDriverNames).bg,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered, allDriverNames]);

  // Revenue by date
  const dailyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((t) => {
      map.set(t.date, (map.get(t.date) ?? 0) + calculateBilling(t.mileage));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
  }, [filtered]);

  // Billing tier breakdown
  const tierData = useMemo(() => {
    let flat = 0, over = 0;
    filtered.forEach((t) => {
      if ((t.mileage ?? 0) <= 10) flat += calculateBilling(t.mileage);
      else over += calculateBilling(t.mileage);
    });
    return [
      { name: "Flat Rate (≤10mi)", value: Math.round(flat * 100) / 100, fill: "hsl(173, 80%, 36%)" },
      { name: "Overage (>10mi)", value: Math.round(over * 100) / 100, fill: "hsl(220, 70%, 50%)" },
    ].filter((d) => d.value > 0);
  }, [filtered]);

  const revenueConfig = { revenue: { label: "Revenue", color: "hsl(173, 80%, 36%)" } };
  const driverChartConfig = Object.fromEntries(driverBreakdown.map((d) => [d.name, { label: d.name, color: d.color }]));
  const tierConfig = Object.fromEntries(tierData.map((d) => [d.name, { label: d.name, color: d.fill }]));

  // Export billing report
  const exportReport = () => {
    const header = "Driver,Trips,Miles,Flat Rate Trips,Overage Trips,Revenue";
    const rows = driverBreakdown.map((d) =>
      [d.name, d.trips, d.miles.toFixed(1), d.flatTrips, d.overTrips, d.revenue.toFixed(2)].join(",")
    );
    const totalsRow = ["TOTAL", filtered.length, totalMiles.toFixed(1), "", "", totalRevenue.toFixed(2)].join(",");
    const csv = [header, ...rows, "", totalsRow].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported billing report for ${driverBreakdown.length} drivers`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Billing & Revenue Report</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Formula: $35.00 flat (1–10 mi) + $2.25/mi (11+ mi)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Drivers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {allDriverNames.map((name) => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportReport} disabled={driverBreakdown.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Summary Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: DollarSign, sub: `${filtered.length} trips` },
            { label: "Total Miles", value: totalMiles.toFixed(1), icon: RouteIcon, sub: "Completed trips" },
            { label: "Avg per Trip", value: formatCurrency(avgPerTrip), icon: TrendingUp, sub: "Revenue average" },
            { label: "Drivers", value: driverBreakdown.length, icon: Users, sub: "With completed trips" },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="stat-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{s.label}</p>
                  <p className="text-2xl font-bold mt-1 font-mono">{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue Trend */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Daily Revenue (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={revenueConfig} className="h-[260px] w-full">
                <LineChart data={dailyRevenue} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(173, 80%, 36%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Tier Breakdown Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Billing Tier Split</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ChartContainer config={tierConfig} className="h-[220px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={tierData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} strokeWidth={2} className="stroke-card">
                    {tierData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
            <div className="flex justify-center gap-4 pb-4">
              {tierData.map((t) => (
                <div key={t.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.fill }} />
                  <span className="text-muted-foreground">{t.name}</span>
                  <span className="font-mono font-semibold">{formatCurrency(t.value)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Revenue per Driver Bar Chart */}
        {driverBreakdown.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue by Driver</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={driverChartConfig} className="h-[300px] w-full">
                <BarChart data={driverBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} className="fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {driverBreakdown.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}

        {/* Detailed Driver Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Driver Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Trips</th>
                    <th>Miles</th>
                    <th>Flat Rate (≤10mi)</th>
                    <th>Overage (&gt;10mi)</th>
                    <th>Total Revenue</th>
                    <th>Avg/Trip</th>
                  </tr>
                </thead>
                <tbody>
                  {driverBreakdown.map((d) => (
                    <tr key={d.name}>
                      <td>
                        <div className="flex items-center gap-2 font-sans font-medium text-foreground">
                          <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                          {d.name}
                        </div>
                      </td>
                      <td>{d.trips}</td>
                      <td>{d.miles.toFixed(1)}</td>
                      <td>{d.flatTrips}</td>
                      <td>{d.overTrips}</td>
                      <td className="font-mono font-semibold text-foreground">{formatCurrency(d.revenue)}</td>
                      <td className="font-mono">{formatCurrency(d.trips > 0 ? d.revenue / d.trips : 0)}</td>
                    </tr>
                  ))}
                  {driverBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted-foreground py-8 font-sans">No completed trips found</td>
                    </tr>
                  )}
                </tbody>
                {driverBreakdown.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="font-sans text-foreground">Total</td>
                      <td>{filtered.length}</td>
                      <td>{totalMiles.toFixed(1)}</td>
                      <td>—</td>
                      <td>—</td>
                      <td className="font-mono text-foreground">{formatCurrency(totalRevenue)}</td>
                      <td className="font-mono">{formatCurrency(avgPerTrip)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
