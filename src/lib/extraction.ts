import { supabase } from "@/integrations/supabase/client";

const systemPrompt = `You are an OCR extraction assistant for Modivcare driver trip screenshots.

You will receive a screenshot from the "Completed Trips" view of the Modivcare driver app.

EXTRACTION RULES:
1. Extract ONLY trips with status "COMPLETED". Ignore ALL cancelled trips.
2. CRITICAL: Look carefully for "CANCELLED" watermarks, overlays, or diagonal text stamped across trip blocks. Any trip with a CANCELLED watermark must be excluded entirely.
3. The driver name appears in the top-right area of the screenshot header bar (e.g. "ASHHAD", "ROBERT").
4. The date appears in the header area (e.g. "Feb 26").
5. For each trip, extract:
   - member_name: Patient/member name (e.g. "CHERRY, EMORY") - format as "Last, First"
   - trip_number: "A" or "B" - shown as a letter indicator on the left side
   - pickup_time: PU time shown on the left (e.g. "8:20 AM" -> "08:20"). Set to empty string "" if not recorded/missing.
   - dropoff_time: DO time shown on the left (e.g. "8:57 AM" -> "08:57"). Set to empty string "" if not recorded/missing.
   - mileage: Miles shown at bottom-left of each trip block (e.g. "12.0 mi" -> 12.0)
   - pickup_address: Address shown next to PU
   - dropoff_address: Address shown next to DO
   - trip_id_reference: The trip reference ID if visible (e.g. "1-20260226-38725-A-PU")
   - is_cancelled: boolean - true if a CANCELLED watermark/overlay is present on the trip block
   - has_pickup: boolean - true if PU time is recorded
   - has_dropoff: boolean - true if DO time is recorded

6. Convert all times to 24-hour format (HH:MM).
7. Convert date to YYYY-MM-DD format.
8. The year should be inferred as 2026 unless otherwise visible.

You MUST respond with ONLY a valid JSON object in this exact format (no markdown, no explanation, no extra text):
{"driver_name":"...","date":"YYYY-MM-DD","trips":[{"member_name":"...","trip_number":"A","pickup_time":"HH:MM","dropoff_time":"HH:MM","mileage":0.0,"pickup_address":"...","dropoff_address":"...","trip_id_reference":"...","is_cancelled":false,"has_pickup":true,"has_dropoff":true}]}

Include ALL trips you can see. The backend will filter based on is_cancelled, has_pickup, and has_dropoff flags.`;

export interface ExtractedTrip {
  member_name: string;
  trip_number: string;
  pickup_time: string;
  dropoff_time: string;
  mileage: number | null;
  pickup_address?: string;
  dropoff_address?: string;
  trip_id_reference?: string;
}

export interface ReviewTrip extends ExtractedTrip {
  review_reason: string;
}

export interface SkippedTrip {
  member_name: string;
  trip_number: string;
  reason: string;
}

export interface ExtractionResult {
  driver_name: string;
  date: string;
  trips: ExtractedTrip[];
  review?: ReviewTrip[];
  skipped?: SkippedTrip[];
}

interface RawTrip {
  member_name: string;
  trip_number: string;
  pickup_time: string;
  dropoff_time: string;
  mileage: number | null;
  pickup_address?: string;
  dropoff_address?: string;
  trip_id_reference?: string;
  is_cancelled?: boolean;
  has_pickup?: boolean;
  has_dropoff?: boolean;
}

function processExtractedData(extracted: { driver_name: string; date: string; trips: RawTrip[] }): ExtractionResult {
  const validTrips: ExtractedTrip[] = [];
  const reviewTrips: ReviewTrip[] = [];
  const skippedTrips: SkippedTrip[] = [];

  for (const trip of extracted.trips || []) {
    if (trip.is_cancelled) {
      skippedTrips.push({
        member_name: trip.member_name,
        trip_number: trip.trip_number,
        reason: "Cancelled watermark detected",
      });
    } else if (
      !trip.has_pickup ||
      !trip.pickup_time ||
      trip.pickup_time.trim() === "" ||
      !trip.has_dropoff ||
      !trip.dropoff_time ||
      trip.dropoff_time.trim() === ""
    ) {
      const reasons: string[] = [];
      if (!trip.has_pickup || !trip.pickup_time || trip.pickup_time.trim() === "") {
        reasons.push("Missing pickup time");
      }
      if (!trip.has_dropoff || !trip.dropoff_time || trip.dropoff_time.trim() === "") {
        reasons.push("Missing dropoff time");
      }
      reviewTrips.push({
        member_name: trip.member_name,
        trip_number: trip.trip_number,
        pickup_time: trip.pickup_time || "",
        dropoff_time: trip.dropoff_time || "",
        mileage: trip.mileage,
        pickup_address: trip.pickup_address,
        dropoff_address: trip.dropoff_address,
        trip_id_reference: trip.trip_id_reference,
        review_reason: reasons.join(", "),
      });
    } else {
      validTrips.push({
        member_name: trip.member_name,
        trip_number: trip.trip_number,
        pickup_time: trip.pickup_time,
        dropoff_time: trip.dropoff_time,
        mileage: trip.mileage,
        pickup_address: trip.pickup_address,
        dropoff_address: trip.dropoff_address,
        trip_id_reference: trip.trip_id_reference,
      });
    }
  }

  return {
    driver_name: extracted.driver_name,
    date: extracted.date,
    trips: validTrips,
    review: reviewTrips.length > 0 ? reviewTrips : undefined,
    skipped: skippedTrips.length > 0 ? skippedTrips : undefined,
  };
}

/**
 * Extract trips using local Ollama - calls Ollama directly from browser
 */
export async function extractWithOllama(
  imageBase64: string,
  ollamaUrl: string,
  ollamaModel: string
): Promise<ExtractionResult> {
  // Remove trailing slash
  const baseUrl = ollamaUrl.replace(/\/$/, "");

  // Extract raw base64 from data URL
  const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel || "qwen2.5vl:7b",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Extract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing. Respond with ONLY the JSON object.",
          images: [rawBase64],
        },
      ],
      format: "json",
      stream: false,
      options: { num_gpu: 4 },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Ollama error:", response.status, errText);
    throw new Error(`Ollama API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content = data.message?.content;

  if (!content) {
    throw new Error("No content in Ollama response");
  }

  // Clean up potential markdown formatting
  const cleaned = content
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  const extracted = JSON.parse(cleaned);
  return processExtractedData(extracted);
}

/**
 * Extract trips using cloud API via Supabase Edge Function
 */
export async function extractWithCloud(
  imageBase64: string,
  cloudProvider: string,
  cloudModel: string,
  apiKey: string
): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke("extract-trips", {
    body: {
      imageBase64,
      provider: "cloud",
      cloudProvider,
      cloudModel,
      apiKey,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.error) {
    throw new Error(data.error);
  }

  return data as ExtractionResult;
}
