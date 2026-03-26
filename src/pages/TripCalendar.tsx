import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useTrips } from "@/hooks/useTrips";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek,
} from "date-fns";

export default function TripCalendar() {
  const { data: trips = [] } = useTrips();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const tripsByDate = useMemo(() => {
    const map = new Map<string, number>();
    trips.forEach((t) => {
      const count = map.get(t.date) ?? 0;
      map.set(t.date, count + 1);
    });
    return map;
  }, [trips]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Trip Calendar</h2>
          <p className="text-sm text-muted-foreground mt-1">View recorded trips by date</p>
        </div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-5" style={{ boxShadow: "var(--shadow-card)" }}>
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h3 className="font-semibold">{format(currentMonth, "MMMM yyyy")}</h3>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground font-medium py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const tripCount = tripsByDate.get(dateStr) ?? 0;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());
              return (
                <div key={dateStr} className={`relative rounded-lg p-2 min-h-[72px] transition-colors ${!isCurrentMonth ? "opacity-30" : ""} ${isToday ? "ring-1 ring-primary" : ""} ${tripCount > 0 ? "bg-primary/5" : "bg-secondary/30"}`}>
                  <span className={`text-xs font-mono ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>{format(day, "d")}</span>
                  {tripCount > 0 && (
                    <div className="mt-1">
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        {tripCount} trip{tripCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
