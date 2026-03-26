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

Return the extracted data as a JSON object. Include ALL trips you can see — the backend will filter based on is_cancelled, has_pickup, and has_dropoff flags.`;

const jsonSchema = {
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
          mileage: { type: "number" },
          pickup_address: { type: "string" },
          dropoff_address: { type: "string" },
          trip_id_reference: { type: "string" },
          is_cancelled: { type: "boolean", description: "True if CANCELLED watermark is present" },
          has_pickup: { type: "boolean", description: "True if PU time is recorded" },
          has_dropoff: { type: "boolean", description: "True if DO time is recorded" },
        },
        required: ["member_name", "trip_number", "pickup_time", "dropoff_time", "is_cancelled", "has_pickup", "has_dropoff"],
      },
    },
  },
  required: ["driver_name", "date", "trips"],
};

// Max payload size: 10MB base64 ≈ ~7.5MB image
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
// Timeout for AI inference requests
const AI_TIMEOUT_MS = 120_000;

async function callOpenAI(apiKey: string, model: string, imageBase64: string): Promise<any> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageBase64 } },
            { type: "text", text: "Extract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing." },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("OpenAI error:", response.status, errText);
    throw new Error(`OpenAI API error (${response.status})`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in OpenAI response");
  return JSON.parse(content);
}

async function callGoogle(apiKey: string, model: string, imageBase64: string): Promise<any> {
  // Extract raw base64 and mime type from data URL
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const [, mimeType, base64Data] = match;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemPrompt + "\n\nExtract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing. Return ONLY valid JSON." },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: jsonSchema,
        },
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Google AI error:", response.status, errText);
    throw new Error(`Google AI API error (${response.status})`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("No content in Google AI response");
  return JSON.parse(content);
}

async function callAnthropic(apiKey: string, model: string, imageBase64: string): Promise<any> {
  // Extract raw base64 and mime type from data URL
  const match = imageBase64.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const [, mediaType, base64Data] = match;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            {
              type: "text",
              text: systemPrompt + "\n\nExtract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing. Return ONLY valid JSON, no markdown formatting.",
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Anthropic error:", response.status, errText);
    throw new Error(`Anthropic API error (${response.status})`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error("No content in Anthropic response");

  // Clean up potential markdown formatting
  const cleaned = content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

async function callOllama(ollamaUrl: string, model: string, imageBase64: string): Promise<any> {
  // Only allow localhost / 127.0.0.1 Ollama URLs to prevent SSRF
  const parsed = new URL(ollamaUrl);
  const host = parsed.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error("Only localhost Ollama URLs are allowed");
  }

  // Rewrite localhost → host.docker.internal for Docker networking
  const resolvedUrl = ollamaUrl.replace(/\/$/, "")
    .replace(/localhost|127\.0\.0\.1/i, "host.docker.internal");

  const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const localPrompt = systemPrompt + "\n\nYou MUST respond with ONLY a valid JSON object, no markdown or explanation.";

  const response = await fetch(`${resolvedUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "qwen2.5vl:7b",
      messages: [
        { role: "system", content: localPrompt },
        {
          role: "user",
          content: "Extract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing. Respond with ONLY the JSON object.",
          images: [rawBase64],
        },
      ],
      format: "json",
      stream: false,
      options: { num_gpu: 4 },
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Ollama error:", response.status, errText);
    throw new Error(`Ollama API error (${response.status})`);
  }

  const data = await response.json();
  const content = data.message?.content;
  if (!content) throw new Error("No content in Ollama response");

  const cleaned = content.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  return JSON.parse(cleaned);
}

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

    const { imageBase64, provider, cloudProvider, cloudModel, apiKey, ollamaUrl, ollamaModel } = await req.json();

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

    let extracted: any;

    if (provider === "local") {
      if (!ollamaUrl) {
        return new Response(
          JSON.stringify({ error: "ollamaUrl is required for local provider" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      extracted = await callOllama(ollamaUrl, ollamaModel, imageBase64);
    } else {
      // Cloud provider
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: `API key is required for ${cloudProvider} provider. Configure it in Settings.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      switch (cloudProvider) {
        case "openai":
          extracted = await callOpenAI(apiKey, cloudModel || "gpt-4o", imageBase64);
          break;
        case "google":
          extracted = await callGoogle(apiKey, cloudModel || "gemini-2.0-flash", imageBase64);
          break;
        case "anthropic":
          extracted = await callAnthropic(apiKey, cloudModel || "claude-sonnet-4-20250514", imageBase64);
          break;
        default:
          return new Response(
            JSON.stringify({ error: `Unknown cloud provider: ${cloudProvider}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }
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
