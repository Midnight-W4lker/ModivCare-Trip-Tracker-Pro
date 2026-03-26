---
noteId: "faa8577028c911f1a9ad1729473a9356"
tags: []

---



## Plan: Create `docs/SELF_HOSTED_ARCHITECTURE.md`

Create a single comprehensive markdown file documenting the fully self-hosted, zero-cost architecture as a migration guide.

### Contents

The document will cover all components from the user's architecture diagram:

1. **ASCII Architecture Diagram** — the user's exact diagram reproduced
2. **Docker Compose** — complete `docker-compose.yml` for PostgreSQL, Redis, MinIO, Ollama
3. **Express API (:3001)** — full route skeleton mapping to current Supabase operations:
   - `GET/POST/PUT/DELETE /api/trips` (mirrors `useTrips`, `useInsertTrips`, `useUpdateTrip`, `useDeleteTrip`, `useDeleteAllTrips`)
   - `GET/POST/PUT/DELETE /api/drivers` (mirrors `useDrivers`, `useInsertDriver`, `useUpdateDriver`, `useDeleteDriver`)
   - `POST /api/extract` (replaces edge function call)
   - `POST /api/upload` (image upload to MinIO/disk)
   - Includes `pg` pool setup, `multer` for uploads, `cors` middleware
4. **Redis Queue (BullMQ)** — job types (`ocr-extract`), worker patterns, retry config
5. **OCR + AI Worker** — Ollama `/v1/chat/completions` call with the same system prompt and tool-calling schema from the existing edge function
6. **PostgreSQL Schema** — full SQL from `docs/LOCAL_SETUP.md` (trips, drivers, indexes, triggers, unique constraints)
7. **MinIO / Disk Storage** — S3-compatible setup for uploaded screenshots
8. **Vite Proxy Config** — `vite.config.ts` proxy rule: `/api` → `http://localhost:3001`
9. **Frontend Migration Notes** — pattern for replacing `supabase.from("trips").select()` → `fetch("/api/trips")`, file-by-file list of hooks to adapt (`useTrips.ts`, `useDrivers.ts`, `useExtractionSettings.ts`)
10. **Environment Variables Reference** — `.env` for all services
11. **Package.json for Backend** — dependencies list (`express`, `pg`, `bullmq`, `ioredis`, `multer`, `minio`, `cors`)
12. **Free Tier Summary** — confirming $0/month

### File

| File | Action |
|---|---|
| `docs/SELF_HOSTED_ARCHITECTURE.md` | Create |

