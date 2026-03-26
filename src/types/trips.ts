export interface Trip {
  id: string;
  memberName: string;
  tripNumber: string; // "A" or "B"
  pickupTime: string;
  dropoffTime: string;
  status: "COMPLETED" | "CANCELLED" | "PENDING";
  mileage: number | null;
  date: string;
  driverName: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  source: "ocr" | "manual";
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  totalTrips: number;
  totalMiles: number;
  status: "active" | "inactive";
}

export interface ExtractedTripData {
  memberName: string;
  tripNumber: string;
  pickupTime: string;
  dropoffTime: string;
  status: string;
  mileage: number | null;
  date: string;
  driverName: string;
  pickupAddress?: string;
  dropoffAddress?: string;
}
