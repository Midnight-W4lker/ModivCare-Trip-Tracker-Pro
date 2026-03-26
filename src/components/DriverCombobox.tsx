import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useDrivers, useInsertDriver } from "@/hooks/useDrivers";
import { getDriverColor } from "@/lib/driverColors";
import { cn } from "@/lib/utils";

interface DriverComboboxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function DriverCombobox({ value, onChange, className }: DriverComboboxProps) {
  const [open, setOpen] = useState(false);
  const { data: drivers = [] } = useDrivers();
  const insertDriver = useInsertDriver();
  const allDriverNames = drivers.map((d) => d.name);

  const color = value ? getDriverColor(value, allDriverNames) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity border",
            className
          )}
          style={color ? { backgroundColor: color.light, color: color.text, borderColor: color.bg + "40" } : undefined}
        >
          {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.bg }} />}
          {value || "Select driver"}
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type driver..." className="capitalize" />
          <CommandList>
            <CommandEmpty>
              <button
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>(`[cmdk-input]`);
                  const val = input?.value?.trim();
                  if (val) {
                    onChange(val);
                    setOpen(false);
                    if (!drivers.some((d) => d.name.toLowerCase() === val.toLowerCase())) {
                      insertDriver.mutate({ name: val });
                    }
                  }
                }}
              >
                Use &amp; create driver
              </button>
            </CommandEmpty>
            <CommandGroup>
              {drivers.map((d) => {
                const dc = getDriverColor(d.name, allDriverNames);
                return (
                  <CommandItem
                    key={d.id}
                    value={d.name}
                    onSelect={() => {
                      onChange(d.name);
                      setOpen(false);
                    }}
                  >
                    <span className="h-2 w-2 rounded-full mr-2" style={{ backgroundColor: dc.bg }} />
                    {d.name}
                    {value === d.name && <Check className="ml-auto h-3 w-3" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
