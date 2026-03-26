import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Return the extracted data using the extract_trips tool. Include ALL trips you can see — the backend will filter based on is_cancelled, has_pickup, and has_dropoff flags.`;

// For local Ollama models that don't support tool calling, ask for JSON directly
const localSystemPrompt = `You are an OCR extraction assistant for Modivcare driver trip screenshots.

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

const tools = [
  {
    type: "function",
    function: {
      name: "extract_trips",
      description: "Return extracted trip data from the screenshot",
      parameters: {
        type: "object",
        properties: {
          driver_name: { type: "string", description: "Driver name from the header" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          trips: {
            type: "array",
            items: {
              type: "object",
              properties: {
                member_name: { type: "string" },
                trip_number: { type: "string", enum: ["A", "B"] },
                pickup_time: { type: "string", description: "HH:MM 24h format or empty string if missing" },
                dropoff_time: { type: "string", description: "HH:MM 24h format or empty string if missing" },
                mileage: { type: "number", nullable: true },
                pickup_address: { type: "string" },
                dropoff_address: { type: "string" },
                trip_id_reference: { type: "string" },
                is_cancelled: { type: "boolean", description: "True if CANCELLED watermark is present" },
                has_pickup: { type: "boolean", description: "True if PU time is recorded" },
                has_dropoff: { type: "boolean", description: "True if DO time is recorded" },
              },
              required: ["member_name", "trip_number", "pickup_time", "dropoff_time", "is_cancelled", "has_pickup", "has_dropoff"],
              additionalProperties: false,
            },
          },
        },
        required: ["driver_name", "date", "trips"],
        additionalProperties: false,
      },
    },
  },
];

// Max payload size: 10MB base64 ≈ ~7.5MB image — generous for phone screenshots
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
// Timeout for AI inference requests
const AI_TIMEOUT_MS = 120_000;
// GPU layer target: ~60% offload (4 of 28 transformer blocks + vision encoder)
const LOCAL_NUM_GPU = 4;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Guard against oversized payloads
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return new Response(
        JSON.stringify({ error: "Payload too large. Max image size is ~7.5 MB." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, provider, cloudModel, ollamaUrl, ollamaModel } = await req.json();
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate base64 data URL format
    if (!imageBase64.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "imageBase64 must be a valid data:image/ URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce payload size on the actual base64 string
    if (imageBase64.length > MAX_PAYLOAD_BYTES) {
      return new Response(
        JSON.stringify({ error: "Image data too large. Max ~7.5 MB." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const messages = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageBase64 } },
          { type: "text", text: "Extract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing." },
        ],
      },
    ];

    let response: Response;
    let isLocal = false;

    if (provider === "local" && ollamaUrl) {
      isLocal = true;

      // Only allow localhost / 127.0.0.1 Ollama URLs to prevent SSRF
      try {
        const parsed = new URL(ollamaUrl);
        const host = parsed.hostname.toLowerCase();
        if (host !== "localhost" && host !== "127.0.0.1") {
          return new Response(
            JSON.stringify({ error: "Only localhost Ollama URLs are allowed" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid ollamaUrl" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Rewrite localhost → host.docker.internal for Docker networking
      const resolvedUrl = ollamaUrl.replace(/\/$/, "")
        .replace(/localhost|127\.0\.0\.1/i, "host.docker.internal");

      // Use native Ollama /api/chat endpoint (not OpenAI-compat) for reliable vision support.
      // Extract raw base64 from data URL and pass via 'images' array.
      const url = `${resolvedUrl}/api/chat`;
      const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const userPrompt = "Extract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing. Respond with ONLY the JSON object.";

      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel || "qwen2.5vl:7b",
          messages: [
            { role: "system", content: localSystemPrompt },
            { role: "user", content: userPrompt, images: [rawBase64] },
          ],
          format: "json",
          stream: false,
          options: { num_gpu: LOCAL_NUM_GPU },
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } else {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cloudModel || "google/gemini-2.5-flash",
          messages,
          tools,
          tool_choice: { type: "function", function: { name: "extract_trips" } },
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    }

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: `AI extraction failed (${response.status})` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();

    let extracted: any;

    if (isLocal) {
      // Native Ollama /api/chat: response is { message: { content: "..." } }
      const content = aiData.message?.content || aiData.choices?.[0]?.message?.content;
      if (!content) {
        console.error("No content in local response:", JSON.stringify(aiData));
        return new Response(
          JSON.stringify({ error: "AI did not return structured data" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      try {
        // Strip markdown code fences if present
        const cleaned = content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
        extracted = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error("Failed to parse local AI JSON:", content);
        return new Response(
          JSON.stringify({ error: "AI returned invalid JSON" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Cloud: structured data via tool calling
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        console.error("No tool call in response:", JSON.stringify(aiData));
        return new Response(
          JSON.stringify({ error: "AI did not return structured data" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      extracted = JSON.parse(toolCall.function.arguments);
    }

    // Post-extraction validation
    const validTrips: any[] = [];
    const reviewTrips: any[] = [];
    const skippedTrips: { trip: any; reason: string }[] = [];

    for (const trip of extracted.trips || []) {
      if (trip.is_cancelled) {
        skippedTrips.push({ trip, reason: "Cancelled watermark detected" });
      } else if ((!trip.has_pickup || !trip.pickup_time || trip.pickup_time.trim() === "") ||
                 (!trip.has_dropoff || !trip.dropoff_time || trip.dropoff_time.trim() === "")) {
        // Missing PU or DO → flag for review instead of skipping
        const { is_cancelled, has_pickup, has_dropoff, ...cleanTrip } = trip;
        const reasons: string[] = [];
        if (!trip.has_pickup || !trip.pickup_time || trip.pickup_time.trim() === "") reasons.push("Missing pickup time");
        if (!trip.has_dropoff || !trip.dropoff_time || trip.dropoff_time.trim() === "") reasons.push("Missing dropoff time");
        reviewTrips.push({ ...cleanTrip, review_reason: reasons.join(", ") });
      } else {
        const { is_cancelled, has_pickup, has_dropoff, ...cleanTrip } = trip;
        validTrips.push(cleanTrip);
      }
    }

    console.log(`Extracted ${validTrips.length} valid, ${reviewTrips.length} review, ${skippedTrips.length} skipped for driver ${extracted.driver_name}`);

    return new Response(JSON.stringify({
      driver_name: extracted.driver_name,
      date: extracted.date,
      trips: validTrips,
      review: reviewTrips,
      skipped: skippedTrips.map(s => ({
        member_name: s.trip.member_name,
        trip_number: s.trip.trip_number,
        reason: s.reason,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-trips error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
