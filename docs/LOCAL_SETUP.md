# Local Setup Guide

Run the entire ModivCare Operations stack on your local machine — **completely free**, no cloud accounts needed.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [1. Clone & Install](#1-clone--install)
- [2. PostgreSQL Database](#2-postgresql-database)
- [3. Supabase Local Setup](#3-supabase-local-setup)
- [4. Edge Function (Local)](#4-edge-function-local)
- [5. Ollama (Local AI)](#5-ollama-local-ai)
- [6. Configure the App](#6-configure-the-app)
- [7. Run Everything](#7-run-everything)
- [Environment Variables Reference](#environment-variables-reference)
- [Free Tier Summary](#free-tier-summary)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Purpose | Install |
|---|---|---|---|
| **Node.js** | 18+ | Frontend dev server | [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) |
| **Docker** | 20+ | Supabase local runtime | [docker.com](https://docs.docker.com/get-docker/) |
| **Supabase CLI** | 1.100+ | Local Supabase stack | `npm install -g supabase` |
| **Ollama** | 0.3+ | Local AI model serving | [ollama.com](https://ollama.com/download) |

> **Note**: Docker is required by Supabase CLI to run PostgreSQL, GoTrue (auth), PostgREST, and other services locally.

---

## 1. Clone & Install

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install
```

---

## 2. PostgreSQL Database

Supabase CLI handles PostgreSQL automatically via Docker. However, if you want to understand the schema or set up a standalone PostgreSQL instance, here's the full SQL:

### Full Schema SQL

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
-- Prevents saving the same trip twice from re-processing a screenshot
ALTER TABLE public.trips
ADD CONSTRAINT trips_unique_composite
UNIQUE (date, driver_name, member_name, trip_number, pickup_time);

-- Index for common queries (date-based lookups)
CREATE INDEX idx_trips_date ON public.trips (date DESC);
CREATE INDEX idx_trips_driver ON public.trips (driver_name);

-- ===================
-- AUTO-UPDATE TRIGGER
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

-- ===================
-- ROW LEVEL SECURITY
-- ===================
-- For local development, RLS is typically disabled.
-- If you need RLS, enable it and create appropriate policies:
-- ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all" ON public.trips FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON public.drivers FOR ALL USING (true);
```

---

## 3. Supabase Local Setup

### Initialize Supabase

If the project doesn't already have a `supabase/` directory with config:

```bash
supabase init
```

### Start Supabase Services

This spins up PostgreSQL, PostgREST, GoTrue, and other services via Docker:

```bash
supabase start
```

After startup, you'll see output like:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters
        anon key: eyJhb...
service_role key: eyJhb...
```

### Configure Environment

Create `.env.local` (this overrides `.env` for local development):

```bash
# .env.local
VITE_SUPABASE_URL="http://127.0.0.1:54321"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon key from supabase start output>"
```

### Apply Database Schema

If you have migrations in `supabase/migrations/`, they run automatically on `supabase start`. Otherwise, apply the schema manually:

1. Open Supabase Studio at `http://127.0.0.1:54323`
2. Go to **SQL Editor**
3. Paste the schema SQL from [Section 2](#full-schema-sql) and run it

Or via CLI:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f schema.sql
```

---

## 4. Edge Function (Local)

The `extract-trips` edge function handles AI-powered OCR extraction.

### Serve Locally

```bash
supabase functions serve extract-trips --no-verify-jwt
```

This starts the function at `http://127.0.0.1:54321/functions/v1/extract-trips`.

> The `--no-verify-jwt` flag matches the production config (`verify_jwt = false` in `config.toml`).

### Environment for Edge Functions

When using **local Ollama**, the edge function doesn't need any API keys — it calls your local Ollama endpoint directly.

When using **cloud AI**, you'd need `LOVABLE_API_KEY` set in the edge function environment (only available in the Lovable Cloud deployment).

---

## 5. Ollama (Local AI)

Ollama runs AI vision models locally on your GPU/CPU — completely free.

### Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows — download from https://ollama.com/download
```

### Pull a Vision Model

The recommended model for trip extraction is **Qwen2.5-VL 7B** (requires ~6GB VRAM):

```bash
ollama pull qwen2.5vl:7b
```

Other supported models:

```bash
# Higher accuracy, needs ~10GB VRAM
ollama pull pixtral:12b

# Alternative options
ollama pull llava:13b
ollama pull minicpm-v:8b
```

### Verify Ollama Is Running

```bash
# Check the API is responding
curl http://localhost:11434/api/tags

# Should return JSON with your installed models
```

### VRAM Requirements

| Model | Parameters | Minimum VRAM | Recommended GPU |
|---|---|---|---|
| Qwen2.5-VL 7B | 7B | 6 GB | RTX 3060 / RTX 4060 |
| MiniCPM-V 8B | 8B | 6 GB | RTX 3060 / RTX 4060 |
| Pixtral 12B | 12B | 10 GB | RTX 3080 / RTX 4070 |
| LLaVA 13B | 13B | 10 GB | RTX 3080 / RTX 4070 |

> **CPU-only**: Ollama works without a GPU but extraction will be significantly slower (~60-120s per image vs ~5-15s with GPU).

---

## 6. Configure the App

Once everything is running, configure the app to use your local services:

1. **Start the dev server**: `npm run dev`
2. **Open the app**: `http://localhost:8080`
3. **Navigate to Settings** (`/settings`)
4. **Select "Local Ollama"** as the AI provider
5. **Set the Ollama endpoint**: `http://localhost:11434` (default)
6. **Select your model** from the dropdown (or type a custom model name)
7. **Click "Test"** to verify the connection — you should see a success toast with the model count

---

## 7. Run Everything

Open **three terminal tabs** and run:

```bash
# Terminal 1 — Supabase (database + API)
supabase start

# Terminal 2 — Edge Function
supabase functions serve extract-trips --no-verify-jwt

# Terminal 3 — Frontend
npm run dev
```

The app is now running at `http://localhost:8080` with:
- ✅ Local PostgreSQL database (via Docker)
- ✅ Local REST API (PostgREST via Supabase)
- ✅ Local edge function for AI extraction
- ✅ Local AI model via Ollama
- ✅ No API keys needed
- ✅ No cloud accounts needed
- ✅ Completely free

---

## Environment Variables Reference

| Variable | Description | Local Value |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase API endpoint | `http://127.0.0.1:54321` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | From `supabase start` output |
| `LOVABLE_API_KEY` | Lovable AI Gateway key (edge function) | Not needed for local Ollama |

---

## Free Tier Summary

| Component | Cost | Notes |
|---|---|---|
| **PostgreSQL** | Free | Runs locally via Docker (Supabase CLI) |
| **Supabase CLI** | Free | Open-source, full local stack |
| **Supabase Studio** | Free | Local dashboard at `localhost:54323` |
| **Ollama** | Free | Open-source, runs on your hardware |
| **AI Models** | Free | Open-weight models (Qwen, LLaVA, etc.) |
| **Node.js / Vite** | Free | Open-source toolchain |
| **Total** | **$0/month** | Only cost is your electricity |

---

## Troubleshooting

### Ollama connection test fails
- Ensure Ollama is running: `ollama serve` (or check system tray on Windows)
- Check the URL in Settings matches your Ollama endpoint (default `http://localhost:11434`)
- If running in Docker, use `http://host.docker.internal:11434` instead

### Edge function can't reach Ollama
- The edge function runs inside Docker (via Supabase CLI)
- Use `http://host.docker.internal:11434` as the Ollama URL when sending from the frontend
- Alternatively, set Ollama to listen on all interfaces: `OLLAMA_HOST=0.0.0.0 ollama serve`

### Database tables don't exist
- Run `supabase db reset` to re-apply all migrations
- Or manually run the schema SQL via Supabase Studio (`localhost:54323`)

### CORS errors
- The edge function includes permissive CORS headers for all origins
- If using a standalone PostgreSQL (not Supabase), ensure your API layer handles CORS

### Slow extraction with Ollama
- Ensure your GPU is being used: check `nvidia-smi` (NVIDIA) or Ollama logs
- Use a smaller model (Qwen2.5-VL 7B vs Pixtral 12B)
- Reduce image resolution before uploading (the app sends full-resolution base64)

### "LOVABLE_API_KEY not configured" error
- This only applies to Cloud AI mode — switch to Local Ollama in Settings
- The `LOVABLE_API_KEY` is automatically provided in Lovable Cloud deployments
