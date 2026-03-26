const DRIVER_PALETTE = [
  { bg: "hsl(173, 80%, 40%)", light: "hsl(173, 80%, 94%)", text: "hsl(173, 80%, 25%)" },  // teal
  { bg: "hsl(220, 70%, 50%)", light: "hsl(220, 70%, 94%)", text: "hsl(220, 70%, 30%)" },  // blue
  { bg: "hsl(280, 65%, 50%)", light: "hsl(280, 65%, 94%)", text: "hsl(280, 65%, 30%)" },  // purple
  { bg: "hsl(25, 90%, 50%)",  light: "hsl(25, 90%, 94%)",  text: "hsl(25, 90%, 30%)" },   // orange
  { bg: "hsl(340, 75%, 50%)", light: "hsl(340, 75%, 94%)", text: "hsl(340, 75%, 30%)" },  // pink
  { bg: "hsl(150, 60%, 40%)", light: "hsl(150, 60%, 94%)", text: "hsl(150, 60%, 25%)" },  // green
  { bg: "hsl(200, 80%, 45%)", light: "hsl(200, 80%, 94%)", text: "hsl(200, 80%, 28%)" },  // sky
  { bg: "hsl(45, 85%, 50%)",  light: "hsl(45, 85%, 94%)",  text: "hsl(45, 85%, 28%)" },   // amber
  { bg: "hsl(0, 70%, 50%)",   light: "hsl(0, 70%, 94%)",   text: "hsl(0, 70%, 30%)" },    // red
  { bg: "hsl(260, 55%, 55%)", light: "hsl(260, 55%, 94%)", text: "hsl(260, 55%, 30%)" },  // indigo
  { bg: "hsl(185, 70%, 42%)", light: "hsl(185, 70%, 94%)", text: "hsl(185, 70%, 25%)" },  // cyan
  { bg: "hsl(310, 60%, 50%)", light: "hsl(310, 60%, 94%)", text: "hsl(310, 60%, 30%)" },  // fuchsia
];

const TRIP_COLORS = {
  A: { bg: "hsl(173, 80%, 40%)", light: "hsl(173, 80%, 94%)", text: "hsl(173, 80%, 25%)" },
  B: { bg: "hsl(280, 65%, 50%)", light: "hsl(280, 65%, 94%)", text: "hsl(280, 65%, 30%)" },
};

export function getDriverColor(driverName: string, allDriverNames: string[]) {
  const sorted = [...new Set(allDriverNames)].sort();
  const index = sorted.indexOf(driverName);
  return DRIVER_PALETTE[(index >= 0 ? index : 0) % DRIVER_PALETTE.length];
}

export function getDriverColorByIndex(index: number) {
  return DRIVER_PALETTE[index % DRIVER_PALETTE.length];
}

export function getTripTypeColor(tripNumber: string) {
  const letter = tripNumber.trim().toUpperCase();
  if (letter in TRIP_COLORS) return TRIP_COLORS[letter as keyof typeof TRIP_COLORS];
  return TRIP_COLORS.A;
}

export { DRIVER_PALETTE };
