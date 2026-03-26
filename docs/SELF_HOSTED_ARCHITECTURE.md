# Self-Hosted Architecture Guide

Run ModivCare Operations on your own infrastructure — **zero cloud dependencies, zero recurring costs**.

This guide provides a complete blueprint for migrating from the Lovable Cloud / Supabase backend to a fully self-hosted stack using Express, Redis, PostgreSQL, Ollama, and MinIO.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Docker Compose](#docker-compose)
- [PostgreSQL Schema](#postgresql-schema)
- [Express API (:3001)](#express-api-3001)
- [Redis Queue (BullMQ)](#redis-queue-bullmq)
- [OCR + AI Worker](#ocr--ai-worker)
- [File Storage (MinIO / Disk)](#file-storage-minio--disk)
- [Vite Proxy Config](#vite-proxy-config)
- [Frontend Migration Notes](#frontend-migration-notes)
- [Backend Package.json](#backend-packagejson)
- [Environment Variables](#environment-variables)
- [Free Tier Summary](#free-tier-summary)
- [Startup Commands](#startup-commands)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React + Vite)                                      │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌─────────────┐  │
│  │ Upload   │ │ Dashboard │ │ Trip Review│ │ Billing     │  │
│  │ Zone     │ │           │ │            │ │ Export      │  │
│  └────┬─────┘ └─────┬─────┘ └─────┬──────┘ └──────┬──────┘  │
│       │             │             │               │          │
│       ▼             ▼             ▼               ▼          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 /api  (Vite Proxy → :3001)              │ │
│  └──────────────────────┬──────────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────────┘
                          │
                          ▼
                ┌───────────────────┐
                │  Express API      │
                │  :3001            │
                │                   │
                │ Upload Handling   │
                │ Trip/Driver CRUD  │
                │ Job Creation      │
                └───────┬───────────┘
                        │
            ┌───────────┴──────────┐
            │                      │
            ▼                      ▼
   ┌────────────────┐     ┌────────────────┐
   │ Redis Queue    │     │ PostgreSQL     │
   │ (BullMQ)       │     │ Database       │
   │ :6379          │     │ :5432          │
   └───────┬────────┘     └────────────────┘
           │
           ▼
   ┌────────────────┐
   │ AI Worker      │
   │                │
   │ Image → JSON   │
   │ (via Ollama)   │
   └───────┬────────┘
           │
           ▼
   ┌────────────────┐     ┌────────────────┐
   │  Ollama        │     │ File Storage   │
   │  Local LLM     │     │ (MinIO / Disk) │
   │  :11434        │     │ :9000          │
   └────────────────┘     └────────────────┘
```

### How It Works

1. **Browser** uploads screenshots via `/api/upload` → Express saves images to MinIO/disk and creates a Redis job
2. **Redis Queue** (BullMQ) manages the job pipeline — prevents overwhelming Ollama with concurrent requests
3. **AI Worker** picks up jobs, sends the image to **Ollama** for vision-based extraction, parses the structured JSON response
4. **Worker** writes extracted trips to **PostgreSQL** and marks the job as complete
5. **Browser** polls `/api/jobs/:id` for status or uses Server-Sent Events for real-time updates
6. All CRUD operations (trips, drivers) go through Express → PostgreSQL directly

---

## Docker Compose

Create `docker-compose.yml` in the project root:

```yaml
version: "3.9"

services:
  # ─── PostgreSQL ───────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: modivcare-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: modivcare
      POSTGRES_USER: modivcare
      POSTGRES_PASSWORD: modivcare_secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./server/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U modivcare -d modivcare"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ─── Redis ────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: modivcare-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # ─── MinIO (S3-compatible storage) ────────────────
  minio:
    image: minio/minio:latest
    container_name: modivcare-storage
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"   # S3 API
      - "9001:9001"   # Web console
    volumes:
      - miniodata:/data

  # ─── Ollama (Local AI) ───────────────────────────
  ollama:
    image: ollama/ollama:latest
    container_name: modivcare-ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollamadata:/root/.ollama
    # Uncomment for NVIDIA GPU support:
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

volumes:
  pgdata:
  redisdata:
  miniodata:
  ollamadata:
```

### Start All Services

```bash
docker compose up -d

# Pull the AI model (first time only)
docker exec modivcare-ollama ollama pull qwen2.5vl:7b

# Verify all services
docker compose ps
```

---

## PostgreSQL Schema

Save as `server/schema.sql` — Docker will auto-run it on first boot:

```sql
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================
-- DRIVERS TABLE
-- ===================
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- TRIPS TABLE
-- ===================
CREATE TABLE public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_name TEXT NOT NULL,
    trip_number TEXT NOT NULL,
    pickup_time TEXT NOT NULL,
    dropoff_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    mileage NUMERIC,
    date DATE NOT NULL,
    driver_name TEXT NOT NULL,
    pickup_address TEXT,
    dropoff_address TEXT,
    source TEXT NOT NULL DEFAULT 'ocr',
    trip_id_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for deduplication
ALTER TABLE public.trips
ADD CONSTRAINT trips_unique_composite
UNIQUE (date, driver_name, member_name, trip_number, pickup_time);

-- Indexes
CREATE INDEX idx_trips_date ON public.trips (date DESC);
CREATE INDEX idx_trips_driver ON public.trips (driver_name);

-- ===================
-- EXTRACTION JOBS TABLE (new — tracks async processing)
-- ===================
CREATE TABLE public.extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
    image_path TEXT NOT NULL,
    result JSONB,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================
-- AUTO-UPDATE TRIGGERS
-- ===================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trips_updated_at
    BEFORE UPDATE ON public.trips
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER drivers_updated_at
    BEFORE UPDATE ON public.drivers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON public.extraction_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

---

## Express API (:3001)

### Project Structure

```
server/
├── schema.sql          # PostgreSQL schema (mounted by Docker)
├── package.json        # Backend dependencies
├── .env                # Environment variables
├── src/
│   ├── index.ts        # Express app entry point
│   ├── db.ts           # PostgreSQL pool
│   ├── routes/
│   │   ├── trips.ts    # Trip CRUD routes
│   │   ├── drivers.ts  # Driver CRUD routes
│   │   ├── extract.ts  # Upload + job creation
│   │   └── jobs.ts     # Job status polling
│   ├── workers/
│   │   └── extract.ts  # BullMQ worker — Ollama extraction
│   ├── queue.ts        # BullMQ queue setup
│   └── storage.ts      # MinIO / disk file storage
```

### Database Connection (`server/src/db.ts`)

```typescript
import { Pool } from "pg";

export const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "modivcare",
  user: process.env.DB_USER || "modivcare",
  password: process.env.DB_PASSWORD || "modivcare_secret",
});
```

### App Entry Point (`server/src/index.ts`)

```typescript
import express from "express";
import cors from "cors";
import { tripRoutes } from "./routes/trips";
import { driverRoutes } from "./routes/drivers";
import { extractRoutes } from "./routes/extract";
import { jobRoutes } from "./routes/jobs";
import { startWorker } from "./workers/extract";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Routes
app.use("/api/trips", tripRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/extract", extractRoutes);
app.use("/api/jobs", jobRoutes);

// Health check
app.get("/api/health", (_, res) => res.json({ status: "ok" }));

// Start worker
startWorker();

app.listen(PORT, () => {
  console.log(`Express API running on :${PORT}`);
});
```

### Trip Routes (`server/src/routes/trips.ts`)

These routes replace the current Supabase operations in `src/hooks/useTrips.ts`:

```typescript
import { Router } from "express";
import { pool } from "../db";

export const tripRoutes = Router();

// GET /api/trips — replaces supabase.from("trips").select("*").order("date", { ascending: false })
tripRoutes.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM trips ORDER BY date DESC"
    );
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips — replaces supabase.from("trips").upsert(trips, { onConflict: "..." })
tripRoutes.post("/", async (req, res) => {
  try {
    const trips: any[] = req.body;
    const inserted: any[] = [];
    const duplicates: number[] = [];

    for (let i = 0; i < trips.length; i++) {
      const t = trips[i];
      try {
        const { rows } = await pool.query(
          `INSERT INTO trips (member_name, trip_number, pickup_time, dropoff_time, status, mileage, date, driver_name, pickup_address, dropoff_address, source, trip_id_reference)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (date, driver_name, member_name, trip_number, pickup_time) DO NOTHING
           RETURNING *`,
          [t.member_name, t.trip_number, t.pickup_time, t.dropoff_time, t.status || "COMPLETED", t.mileage, t.date, t.driver_name, t.pickup_address, t.dropoff_address, t.source || "ocr", t.trip_id_reference]
        );
        if (rows.length > 0) inserted.push(rows[0]);
        else duplicates.push(i);
      } catch (err) {
        console.error(`Trip insert error at index ${i}:`, err);
      }
    }

    res.json({ inserted, total: trips.length, duplicates: duplicates.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/trips/:id — replaces supabase.from("trips").update(updates).eq("id", id)
tripRoutes.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = keys.map((k) => updates[k]);

    await pool.query(
      `UPDATE trips SET ${sets} WHERE id = $1`,
      [id, ...values]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id — replaces supabase.from("trips").delete().eq("id", id)
tripRoutes.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM trips WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips — replaces supabase.from("trips").delete().gt("created_at", "1970-...")
tripRoutes.delete("/", async (req, res) => {
  try {
    await pool.query("DELETE FROM trips");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

### Driver Routes (`server/src/routes/drivers.ts`)

These routes replace the current Supabase operations in `src/hooks/useDrivers.ts`:

```typescript
import { Router } from "express";
import { pool } from "../db";

export const driverRoutes = Router();

// GET /api/drivers — replaces supabase.from("drivers").select("*").order("name")
driverRoutes.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM drivers ORDER BY name");
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/drivers — replaces supabase.from("drivers").insert(driver).select()
driverRoutes.post("/", async (req, res) => {
  try {
    const { name, status } = req.body;
    const { rows } = await pool.query(
      "INSERT INTO drivers (name, status) VALUES ($1, $2) RETURNING *",
      [name, status || "active"]
    );
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:id — replaces supabase.from("drivers").update(updates).eq("id", id)
driverRoutes.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const keys = Object.keys(updates);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
    const values = keys.map((k) => updates[k]);

    await pool.query(`UPDATE drivers SET ${sets} WHERE id = $1`, [id, ...values]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/drivers/:id — replaces supabase.from("drivers").delete().eq("id", id)
driverRoutes.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM drivers WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

### Upload + Extraction Route (`server/src/routes/extract.ts`)

Replaces the current `supabase.functions.invoke("extract-trips", ...)` call:

```typescript
import { Router } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { extractionQueue } from "../queue";
import { pool } from "../db";
import { saveImage } from "../storage";

export const extractRoutes = Router();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// POST /api/extract — accepts base64 image, creates extraction job
extractRoutes.post("/", async (req, res) => {
  try {
    const { imageBase64, ollamaModel } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    // Save image to storage
    const imageId = uuid();
    const imagePath = await saveImage(imageId, imageBase64);

    // Create job record in DB
    const { rows } = await pool.query(
      "INSERT INTO extraction_jobs (image_path, status) VALUES ($1, 'pending') RETURNING id",
      [imagePath]
    );
    const jobId = rows[0].id;

    // Add to BullMQ queue
    await extractionQueue.add("extract-trips", {
      jobId,
      imagePath,
      imageBase64,
      ollamaModel: ollamaModel || "qwen2.5vl:7b",
    });

    res.json({ jobId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/extract/sync — synchronous extraction (no queue, direct Ollama call)
// Use this for simpler deployments without Redis
extractRoutes.post("/sync", async (req, res) => {
  try {
    const { imageBase64, ollamaUrl, ollamaModel } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const url = `${(ollamaUrl || "http://localhost:11434").replace(/\/$/, "")}/v1/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel || "qwen2.5vl:7b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageBase64 } },
              { type: "text", text: "Extract all trips from this Modivcare driver screenshot. Flag any with CANCELLED watermarks and note if PU/DO times are missing." },
            ],
          },
        ],
        tools: TOOLS,
        tool_choice: { type: "function", function: { name: "extract_trips" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: `Ollama error (${response.status}): ${errText}` });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return res.status(500).json({ error: "AI did not return structured data" });
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    // Post-extraction validation (same logic as current edge function)
    const validTrips: any[] = [];
    const reviewTrips: any[] = [];
    const skippedTrips: any[] = [];

    for (const trip of extracted.trips || []) {
      if (trip.is_cancelled) {
        skippedTrips.push({ member_name: trip.member_name, trip_number: trip.trip_number, reason: "Cancelled watermark detected" });
      } else if (!trip.has_pickup || !trip.pickup_time?.trim() || !trip.has_dropoff || !trip.dropoff_time?.trim()) {
        const { is_cancelled, has_pickup, has_dropoff, ...cleanTrip } = trip;
        const reasons: string[] = [];
        if (!trip.has_pickup || !trip.pickup_time?.trim()) reasons.push("Missing pickup time");
        if (!trip.has_dropoff || !trip.dropoff_time?.trim()) reasons.push("Missing dropoff time");
        reviewTrips.push({ ...cleanTrip, review_reason: reasons.join(", ") });
      } else {
        const { is_cancelled, has_pickup, has_dropoff, ...cleanTrip } = trip;
        validTrips.push(cleanTrip);
      }
    }

    res.json({
      driver_name: extracted.driver_name,
      date: extracted.date,
      trips: validTrips,
      review: reviewTrips,
      skipped: skippedTrips,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Shared Constants ─────────────────────────────────────

const SYSTEM_PROMPT = `You are an OCR extraction assistant for Modivcare driver trip screenshots.

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

const TOOLS = [
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
                pickup_time: { type: "string" },
                dropoff_time: { type: "string" },
                mileage: { type: "number", nullable: true },
                pickup_address: { type: "string" },
                dropoff_address: { type: "string" },
                trip_id_reference: { type: "string" },
                is_cancelled: { type: "boolean" },
                has_pickup: { type: "boolean" },
                has_dropoff: { type: "boolean" },
              },
              required: ["member_name", "trip_number", "pickup_time", "dropoff_time", "is_cancelled", "has_pickup", "has_dropoff"],
            },
          },
        },
        required: ["driver_name", "date", "trips"],
      },
    },
  },
];
```

### Job Status Route (`server/src/routes/jobs.ts`)

```typescript
import { Router } from "express";
import { pool } from "../db";

export const jobRoutes = Router();

// GET /api/jobs/:id — poll job status
jobRoutes.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM extraction_jobs WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## Redis Queue (BullMQ)

### Queue Setup (`server/src/queue.ts`)

```typescript
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null, // Required by BullMQ
});

export const extractionQueue = new Queue("extraction", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000, // 5s → 10s → 20s
    },
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 50 },
  },
});
```

### Job Types

| Job Name | Payload | Description |
|---|---|---|
| `extract-trips` | `{ jobId, imagePath, imageBase64, ollamaModel }` | Send image to Ollama, parse response, update DB |

### Why BullMQ?

- **Rate limiting**: Ollama can only process one image at a time efficiently — BullMQ ensures sequential processing
- **Retry with backoff**: If Ollama is busy or crashes, jobs retry automatically
- **Job persistence**: Redis persists jobs across server restarts
- **Monitoring**: Use [Bull Board](https://github.com/felixmosh/bull-board) for a web UI to monitor queues

---

## OCR + AI Worker

### Worker Implementation (`server/src/workers/extract.ts`)

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "../queue";
import { pool } from "../db";

export function startWorker() {
  const worker = new Worker(
    "extraction",
    async (job) => {
      const { jobId, imageBase64, ollamaModel } = job.data;

      // Update job status
      await pool.query(
        "UPDATE extraction_jobs SET status = 'processing' WHERE id = $1",
        [jobId]
      );

      try {
        // Call Ollama
        const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
        const response = await fetch(`${ollamaUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "image_url", image_url: { url: imageBase64 } },
                  { type: "text", text: "Extract all trips from this Modivcare driver screenshot." },
                ],
              },
            ],
            tools: TOOLS,
            tool_choice: { type: "function", function: { name: "extract_trips" } },
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama error: ${response.status}`);
        }

        const aiData = await response.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

        if (!toolCall?.function?.arguments) {
          throw new Error("AI did not return structured data");
        }

        const extracted = JSON.parse(toolCall.function.arguments);

        // Store result
        await pool.query(
          "UPDATE extraction_jobs SET status = 'completed', result = $1 WHERE id = $2",
          [JSON.stringify(extracted), jobId]
        );

        console.log(`Job ${jobId}: extracted ${extracted.trips?.length || 0} trips for ${extracted.driver_name}`);
      } catch (err: any) {
        await pool.query(
          "UPDATE extraction_jobs SET status = 'failed', error = $1 WHERE id = $2",
          [err.message, jobId]
        );
        throw err; // BullMQ will retry
      }
    },
    {
      connection: redisConnection,
      concurrency: 1, // Process one image at a time (Ollama limitation)
    }
  );

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  console.log("Extraction worker started");
}

// SYSTEM_PROMPT and TOOLS are the same constants from the extract route
// In practice, import from a shared module
```

### Ollama API Details

The worker calls Ollama's OpenAI-compatible endpoint:

```
POST http://localhost:11434/v1/chat/completions

{
  "model": "qwen2.5vl:7b",
  "messages": [
    { "role": "system", "content": "..." },
    {
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } },
        { "type": "text", "text": "Extract all trips..." }
      ]
    }
  ],
  "tools": [...],
  "tool_choice": { "type": "function", "function": { "name": "extract_trips" } }
}
```

The response contains a tool call with structured JSON in `choices[0].message.tool_calls[0].function.arguments`.

---

## File Storage (MinIO / Disk)

### Storage Abstraction (`server/src/storage.ts`)

```typescript
import { Client } from "minio";
import fs from "fs/promises";
import path from "path";

const USE_MINIO = process.env.STORAGE_TYPE === "minio";
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const BUCKET = "screenshots";

// MinIO client (only initialized if needed)
const minio = USE_MINIO
  ? new Client({
      endPoint: process.env.MINIO_ENDPOINT || "localhost",
      port: parseInt(process.env.MINIO_PORT || "9000"),
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    })
  : null;

export async function initStorage() {
  if (USE_MINIO && minio) {
    const exists = await minio.bucketExists(BUCKET);
    if (!exists) await minio.makeBucket(BUCKET);
  } else {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export async function saveImage(id: string, base64Data: string): Promise<string> {
  // Strip data URL prefix
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  const filename = `${id}.png`;

  if (USE_MINIO && minio) {
    await minio.putObject(BUCKET, filename, buffer);
    return `minio://${BUCKET}/${filename}`;
  } else {
    const filepath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filepath, buffer);
    return filepath;
  }
}
```

### Which to Choose?

| Feature | Disk Storage | MinIO |
|---|---|---|
| **Setup** | Zero config | Docker container |
| **Scalability** | Single server | Distributed, S3-compatible |
| **Backup** | Manual file copy | Built-in replication |
| **Best for** | Solo user, dev | Team, production |

For most self-hosted setups, **disk storage is fine**. Set `STORAGE_TYPE=disk` (default) and images go to `./uploads/`.

---

## Vite Proxy Config

Update `vite.config.ts` to proxy API calls to Express:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
```

Now all `fetch("/api/...")` calls from the browser are proxied to Express.

---

## Frontend Migration Notes

### Overview

Replace Supabase SDK calls with standard `fetch` calls to your Express API. The UI components, state management (TanStack Query), and business logic (billing calculations) stay exactly the same.

### File-by-File Migration

#### `src/hooks/useTrips.ts`

**Before (Supabase):**
```typescript
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase
  .from("trips")
  .select("*")
  .order("date", { ascending: false });
```

**After (Express):**
```typescript
// No supabase import needed

export function useTrips() {
  return useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const res = await fetch("/api/trips");
      if (!res.ok) throw new Error("Failed to fetch trips");
      return res.json() as Promise<TripRow[]>;
    },
  });
}

export function useInsertTrips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trips: Omit<TripRow, "id" | "created_at" | "updated_at">[]) => {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(trips),
      });
      if (!res.ok) throw new Error("Failed to save trips");
      return res.json();
    },
    onSuccess: ({ inserted, total, duplicates }) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      const msg = duplicates > 0
        ? `${inserted.length} trip(s) saved, ${duplicates} duplicate(s) skipped`
        : `${inserted.length} trip(s) saved`;
      toast.success(msg);
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });
}

export function useUpdateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TripRow> & { id: string }) => {
      const res = await fetch(`/api/trips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Trip updated");
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/trips/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("Trip deleted");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });
}

export function useDeleteAllTrips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/trips", { method: "DELETE" });
      if (!res.ok) throw new Error("Delete all failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success("All trip records deleted");
    },
    onError: (err) => toast.error(`Delete all failed: ${err.message}`),
  });
}
```

#### `src/hooks/useDrivers.ts`

**Before:**
```typescript
const { data, error } = await supabase.from("drivers").select("*").order("name");
```

**After:**
```typescript
export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const res = await fetch("/api/drivers");
      if (!res.ok) throw new Error("Failed to fetch drivers");
      return res.json() as Promise<DriverRow[]>;
    },
  });
}

export function useInsertDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (driver: { name: string; status?: string }) => {
      const res = await fetch("/api/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(driver),
      });
      if (!res.ok) throw new Error("Failed to add driver");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      toast.success("Driver added");
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DriverRow> & { id: string }) => {
      const res = await fetch(`/api/drivers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      toast.success("Driver updated");
    },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });
}

export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/drivers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      toast.success("Driver deleted");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });
}
```

#### `src/pages/ExtractTrips.tsx`

**Before:**
```typescript
import { supabase } from "@/integrations/supabase/client";

const { data, error } = await supabase.functions.invoke("extract-trips", {
  body: { imageBase64, provider, cloudModel, ollamaUrl, ollamaModel },
});
```

**After:**
```typescript
// Remove supabase import, use fetch directly

const response = await fetch("/api/extract/sync", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    imageBase64: image.preview,
    ollamaUrl: settings.ollamaUrl,
    ollamaModel: settings.ollamaModel,
  }),
});

if (!response.ok) {
  const err = await response.json();
  throw new Error(err.error || "Extraction failed");
}

const result = await response.json();
```

#### `src/hooks/useExtractionSettings.ts`

**Changes:**
- Remove `"cloud"` from `AIProvider` type — only `"local"` mode exists
- Remove `cloudModel` from settings
- Remove `CLOUD_MODELS` array
- Keep `LOCAL_MODELS`, `ollamaUrl`, `ollamaModel`

#### Files That Need No Changes

These files have no Supabase dependency and work as-is:

| File | Reason |
|---|---|
| `src/lib/billing.ts` | Pure math — `calculateBilling(miles)` |
| `src/lib/driverColors.ts` | Static color palette |
| `src/lib/utils.ts` | Tailwind merge utility |
| `src/types/trips.ts` | TypeScript types |
| `src/components/TripsTable.tsx` | Receives data via props |
| `src/components/StatCard.tsx` | Presentational component |
| `src/components/ExportTripsDialog.tsx` | Client-side CSV generation |
| `src/components/AppSidebar.tsx` | Navigation only |
| `src/components/DashboardLayout.tsx` | Layout wrapper |
| All `src/components/ui/*` | shadcn/ui components |
| `src/pages/Dashboard.tsx` | Consumes hooks — auto-adapts |
| `src/pages/BillingReport.tsx` | Consumes hooks — auto-adapts |
| `src/pages/TripCalendar.tsx` | Consumes hooks — auto-adapts |

### Summary of Changes

| File | Change Required |
|---|---|
| `src/hooks/useTrips.ts` | Replace Supabase calls with `fetch("/api/...")` |
| `src/hooks/useDrivers.ts` | Replace Supabase calls with `fetch("/api/...")` |
| `src/hooks/useExtractionSettings.ts` | Remove cloud provider option |
| `src/pages/ExtractTrips.tsx` | Replace `supabase.functions.invoke` with `fetch("/api/extract/sync")` |
| `src/pages/Settings.tsx` | Remove cloud AI section |
| `src/pages/ManualEntry.tsx` | Uses `useInsertTrips` hook — auto-adapts |
| `src/pages/AdminPanel.tsx` | Uses hooks — auto-adapts |
| `src/integrations/supabase/*` | Delete entire directory |
| `vite.config.ts` | Add `/api` proxy |

### Files to Delete

```
src/integrations/supabase/client.ts
src/integrations/supabase/types.ts
```

---

## Backend Package.json

Create `server/package.json`:

```json
{
  "name": "modivcare-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc"
  },
  "dependencies": {
    "express": "^4.21.0",
    "cors": "^2.8.5",
    "pg": "^8.13.0",
    "bullmq": "^5.25.0",
    "ioredis": "^5.4.0",
    "multer": "^1.4.5-lts.1",
    "minio": "^8.0.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/multer": "^1.4.11",
    "@types/pg": "^8.11.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

Install and run:

```bash
cd server
npm install
npm run dev
```

---

## Environment Variables

Create `server/.env`:

```bash
# ─── Server ────────────────────────────
PORT=3001

# ─── PostgreSQL ────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_NAME=modivcare
DB_USER=modivcare
DB_PASSWORD=modivcare_secret

# ─── Redis ─────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ─── Ollama ────────────────────────────
OLLAMA_URL=http://localhost:11434

# ─── Storage ───────────────────────────
STORAGE_TYPE=disk          # "disk" or "minio"
UPLOAD_DIR=./uploads       # For disk storage

# ─── MinIO (if STORAGE_TYPE=minio) ────
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

Frontend `.env.local` (replaces the Supabase config):

```bash
# No Supabase variables needed!
# The Vite proxy handles /api → localhost:3001
```

---

## Free Tier Summary

| Component | Cost | Notes |
|---|---|---|
| **PostgreSQL** | Free | Docker container, local storage |
| **Redis** | Free | Docker container, in-memory |
| **MinIO** | Free | Docker container (or skip — use disk) |
| **Ollama** | Free | Open-source, runs on your GPU/CPU |
| **AI Models** | Free | Open-weight (Qwen2.5-VL, LLaVA, Pixtral) |
| **Express.js** | Free | Open-source |
| **BullMQ** | Free | Open-source |
| **React + Vite** | Free | Open-source |
| **Total** | **$0/month** | Only cost is electricity + hardware |

### Hardware Requirements

| Setup | RAM | GPU | Est. Cost |
|---|---|---|---|
| **Minimum** | 8 GB | None (CPU-only Ollama) | Any modern laptop |
| **Recommended** | 16 GB | 6 GB VRAM (RTX 3060) | ~$300 used GPU |
| **Optimal** | 32 GB | 10+ GB VRAM (RTX 3080) | ~$500 used GPU |

---

## Startup Commands

### Option A: Full Stack with Docker Compose

```bash
# Terminal 1 — All backend services
docker compose up -d

# Pull AI model (first time only)
docker exec modivcare-ollama ollama pull qwen2.5vl:7b

# Terminal 2 — Express API + Worker
cd server && npm run dev

# Terminal 3 — Frontend
npm run dev
```

### Option B: Minimal (No Redis, No MinIO)

For solo use, skip Redis and MinIO entirely. Use the synchronous `/api/extract/sync` endpoint:

```bash
# Terminal 1 — Just PostgreSQL + Ollama
docker compose up postgres ollama -d

# Terminal 2 — Express API (no queue worker needed)
cd server && npm run dev

# Terminal 3 — Frontend
npm run dev
```

Open `http://localhost:8080` — your fully self-hosted ModivCare Operations instance.
