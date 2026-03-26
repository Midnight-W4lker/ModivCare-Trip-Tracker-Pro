import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { TripsTable } from "@/components/TripsTable";
import { useTrips } from "@/hooks/useTrips";
import { useDrivers } from "@/hooks/useDrivers";
import { calculateBilling, formatCurrency } from "@/lib/billing";
import { getDriverColor, getDriverColorByIndex } from "@/lib/driverColors";
import { Route as RouteIcon, Users, CheckCircle, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
  PieChart, Pie, Cell,
  LineChart, Line,
  ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const { data: trips = [] } = useTrips();
  const { data: drivers = [] } = useDrivers();

  const completedTrips = trips.filter((t) => t.status === "COMPLETED");
  const totalMiles = completedTrips.reduce((sum, t) => sum + (t.mileage ?? 0), 0);
  const activeDrivers = drivers.filter((d) => d.status === "active");
  const totalRevenue = completedTrips.reduce((sum, t) => sum + calculateBilling(t.mileage), 0);

  const allDriverNames = useMemo(() => [...new Set(trips.map((t) => t.driver_name))].sort(), [trips]);

  // Trip volume by date (last 30 days)
  const volumeData = useMemo(() => {
    const map = new Map<string, number>();
    trips.forEach((t) => {
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, count]) => ({ date, trips: count }));
  }, [trips]);

  // Trips per driver
  const driverData = useMemo(() => {
    const map = new Map<string, number>();
    trips.forEach((t) => {
      map.set(t.driver_name, (map.get(t.driver_name) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({
        name,
        trips: count,
        fill: getDriverColor(name, allDriverNames).bg,
      }));
  }, [trips, allDriverNames]);

  // Status breakdown
  const statusData = useMemo(() => {
    const counts = { COMPLETED: 0, CANCELLED: 0, PENDING: 0 };
    trips.forEach((t) => {
      const s = t.status as keyof typeof counts;
      if (s in counts) counts[s]++;
    });
    return [
      { name: "Completed", value: counts.COMPLETED, fill: "hsl(152, 69%, 36%)" },
      { name: "Cancelled", value: counts.CANCELLED, fill: "hsl(0, 72%, 51%)" },
      { name: "Pending", value: counts.PENDING, fill: "hsl(38, 92%, 50%)" },
    ].filter((d) => d.value > 0);
  }, [trips]);

  // Revenue by date
  const revenueData = useMemo(() => {
    const map = new Map<string, number>();
    completedTrips.forEach((t) => {
      const rev = calculateBilling(t.mileage);
      map.set(t.date, (map.get(t.date) ?? 0) + rev);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
  }, [completedTrips]);

  // Display trips for table
  const displayTrips = trips.slice(0, 10).map((t) => ({
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

  const volumeConfig = { trips: { label: "Trips", color: "hsl(173, 80%, 36%)" } };
  const revenueConfig = { revenue: { label: "Revenue", color: "hsl(220, 70%, 50%)" } };
  const driverChartConfig = Object.fromEntries(
    driverData.map((d) => [d.name, { label: d.name, color: d.fill }])
  );
  const statusConfig = Object.fromEntries(
    statusData.map((d) => [d.name, { label: d.name, color: d.fill }])
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Operations Overview</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time trip and driver metrics</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Trips" value={completedTrips.length} subtitle="Completed" icon={RouteIcon} />
          <StatCard label="Active Drivers" value={activeDrivers.length} subtitle={`of ${drivers.length} total`} icon={Users} />
          <StatCard label="Total Miles" value={totalMiles.toFixed(1)} subtitle="Completed trips" icon={TrendingUp} />
          <StatCard label="Completion Rate" value={trips.length > 0 ? `${Math.round((completedTrips.length / trips.length) * 100)}%` : "—"} subtitle="All trips" icon={CheckCircle} />
          <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} subtitle="Billing estimate" icon={DollarSign} />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Trip Volume Area Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Trip Volume (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={volumeConfig} className="h-[260px] w-full">
                <AreaChart data={volumeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tripGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(173, 80%, 36%)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(173, 80%, 36%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="trips" stroke="hsl(173, 80%, 36%)" fill="url(#tripGrad)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Revenue Line Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Daily Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={revenueConfig} className="h-[260px] w-full">
                <LineChart data={revenueData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(220, 70%, 50%)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Trips per Driver Bar Chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Trips per Driver</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={driverChartConfig} className="h-[280px] w-full">
                <BarChart data={driverData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} className="fill-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="trips" radius={[0, 4, 4, 0]}>
                    {driverData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Status Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Trip Status</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ChartContainer config={statusConfig} className="h-[260px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} strokeWidth={2} className="stroke-card">
                    {statusData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            </CardContent>
            <div className="flex justify-center gap-4 pb-4">
              {statusData.map((s) => (
                <div key={s.name} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.fill }} />
                  <span className="text-muted-foreground">{s.name}</span>
                  <span className="font-mono font-semibold">{s.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <TripsTable trips={displayTrips} title="Recent Trips" />
      </div>
    </DashboardLayout>
  );
}
