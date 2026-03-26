# ModivCare Operations

A full-featured trip management dashboard for **Non-Emergency Medical Transportation (NEMT)** drivers operating under ModivCare. Built to streamline trip logging, AI-powered screenshot extraction, billing calculations, and driver management — all from one interface.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Pages & Features](#pages--features)
- [Database Schema](#database-schema)
- [Edge Function: `extract-trips`](#edge-function-extract-trips)
- [Billing Formula](#billing-formula)
- [Key Components](#key-components)
- [Custom Hooks](#custom-hooks)
- [Utility Libraries](#utility-libraries)
- [Getting Started](#getting-started)

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | React 18 | UI rendering with functional components & hooks |
| **Build Tool** | Vite | Fast dev server with HMR, optimized production builds |
| **Language** | TypeScript | Type safety across the entire codebase |
| **Styling** | Tailwind CSS 4 + `tailwindcss-animate` | Utility-first CSS with custom design tokens |
| **UI Components** | shadcn/ui (Radix primitives) | Accessible, composable components (Dialog, Popover, Command, Sidebar, etc.) |
| **Animations** | Framer Motion | Page transitions, card animations, staggered lists |
| **Charts** | Recharts | Area, line, bar, and pie charts on Dashboard & Billing |
| **Data Fetching** | TanStack React Query v5 | Caching, mutations, optimistic updates, query invalidation |
| **Routing** | React Router v6 | Client-side routing with 9 page routes |
| **Theming** | next-themes | Light/dark mode toggle with system preference support |
| **Toasts** | Sonner | Non-blocking success/error notifications |
| **Backend** | Supabase (PostgreSQL + Edge Functions) | Database, real-time, serverless functions |
| **AI/OCR** | Lovable AI Gateway or local Ollama | Vision models for screenshot extraction |
| **Edge Runtime** | Deno (Supabase Edge Functions) | Serverless function for AI-powered trip extraction |

---

## Project Structure

```
├── public/                          # Static assets
├── src/
│   ├── App.tsx                      # Root component — routes, providers, theme
│   ├── main.tsx                     # Entry point
│   ├── index.css                    # Design tokens, custom CSS variables
│   ├── components/
│   │   ├── AppSidebar.tsx           # Collapsible sidebar with nav groups
│   │   ├── DashboardLayout.tsx      # Sidebar + main content wrapper
│   │   ├── DriverCombobox.tsx       # Searchable driver picker with auto-create
│   │   ├── ExportTripsDialog.tsx    # CSV export with field picker
│   │   ├── NavLink.tsx              # Active-aware navigation link
│   │   ├── StatCard.tsx             # Animated metric card with icon
│   │   ├── TripsTable.tsx           # Sortable/searchable trip data table
│   │   └── ui/                      # shadcn/ui components (40+ files)
│   ├── hooks/
│   │   ├── useTrips.ts              # CRUD operations for trips table
│   │   ├── useDrivers.ts            # CRUD operations for drivers table
│   │   ├── useExtractionSettings.ts # AI provider config (cloud vs local)
│   │   ├── use-mobile.tsx           # Responsive breakpoint detection
│   │   └── use-toast.ts             # Toast notification hook
│   ├── lib/
│   │   ├── billing.ts              # Revenue calculation formula
│   │   ├── driverColors.ts         # 12-color HSL palette for driver tags
│   │   └── utils.ts                # Tailwind `cn()` merge utility
│   ├── pages/
│   │   ├── Dashboard.tsx            # Analytics overview with charts
│   │   ├── ExtractTrips.tsx         # AI-powered batch screenshot extraction
│   │   ├── AllTrips.tsx             # Full trip list with search & export
│   │   ├── ManualEntry.tsx          # Form-based trip creation
│   │   ├── Drivers.tsx              # Driver cards with stats
│   │   ├── BillingReport.tsx        # Revenue report with per-driver breakdown
│   │   ├── TripCalendar.tsx         # Monthly calendar with trip counts
│   │   ├── AdminPanel.tsx           # CRUD admin for trips & drivers
│   │   ├── Settings.tsx             # AI provider configuration
│   │   └── NotFound.tsx             # 404 page
│   ├── types/
│   │   └── trips.ts                 # TypeScript interfaces (Trip, Driver, ExtractedTripData)
│   ├── data/
│   │   └── mockTrips.ts             # Sample data for development
│   └── integrations/
│       └── supabase/
│           ├── client.ts            # Auto-generated Supabase client
│           └── types.ts             # Auto-generated database types
├── supabase/
│   ├── config.toml                  # Edge function config (JWT verification disabled)
│   └── functions/
│       └── extract-trips/
│           └── index.ts             # AI extraction edge function
├── tailwind.config.ts               # Extended theme with custom tokens
├── vite.config.ts                   # Vite config with path aliases
└── package.json
```

---

## Pages & Features

### 1. Dashboard (`/`)

The landing page providing a high-level overview of all operations.

- **Stat Cards** (animated with Framer Motion):
  - Total trips count
  - Active drivers count
  - Total miles driven
  - Completion rate (percentage of COMPLETED vs total)
  - Total revenue (calculated via billing formula)
- **Charts** (Recharts):
  - **Area chart** — Trips over time (by date)
  - **Line chart** — Mileage trends
  - **Bar chart** — Trips per driver
  - **Pie chart** — Trip status distribution (Completed/Cancelled/Pending)

### 2. Extract Trips (`/extract`)

The core feature — batch AI-powered extraction from ModivCare driver app screenshots.

- **Image Upload**: Drag-and-drop or click to upload multiple screenshots simultaneously
- **Sequential Processing**: Images are processed one at a time through the AI edge function to avoid rate limits
- **3-Tier Validation**:
  - ✅ **Valid trips** — Complete data, ready to save
  - ⚠️ **Review trips** — Missing pickup/dropoff times, editable inline before accepting
  - ❌ **Skipped trips** — Cancelled watermark detected, excluded automatically
- **Inline Editing**: Every field (member name, times, mileage, addresses) is editable before saving
- **Driver Combobox**: Colored tag showing the detected driver, click to change or type a new name
  - Auto-creates new drivers in the database when a custom name is used
- **Per-Trip Actions**: Delete individual trips, add new blank trips to a result
- **Bulk Save**: Save all valid trips for an image, or accept individual review trips
- **Deduplication**: Uses a composite unique key (`date + driver_name + member_name + trip_number + pickup_time`) to prevent duplicate inserts

### 3. All Trips (`/trips`)

A searchable, sortable table of every trip in the database.

- **Search**: Filter by member name, driver name, or any text field
- **Delete All**: Bulk delete with confirmation dialog
- **CSV Export**: `ExportTripsDialog` lets you pick which fields to include (member name, driver, date, times, mileage, addresses, status, source)
- **Colored Badges**: Driver names and trip types (A/B) shown as color-coded tags

### 4. Manual Entry (`/manual-entry`)

Form-based trip creation for manually logging trips not captured via screenshots.

- All fields: member name, trip number (A/B), date, pickup/dropoff times, mileage, addresses, status, driver
- **Driver Selection**: `DriverCombobox` with auto-create support
- **Auto-capitalization**: All text inputs use CSS `capitalize` class
- Source is automatically set to `"manual"`

### 5. Drivers (`/drivers`)

Visual driver management with color-coded cards.

- Each driver displayed as a card with:
  - Color-coded left border (from `driverColors.ts` palette)
  - Total trips count
  - Total miles driven
  - Total revenue (calculated from their trips)
  - Active/inactive status badge
- Stats computed by joining driver data with their trips

### 6. Billing Report (`/billing`)

Revenue analytics based on the NEMT billing formula.

- **Summary Cards**: Total revenue, average per trip, total miles, billable trip count
- **Charts**:
  - Revenue over time (area chart)
  - Revenue by driver (bar chart)
- **Per-Driver Breakdown Table**: Driver name, trip count, total miles, total revenue, average revenue per trip
- **CSV Export**: Download the billing breakdown as CSV

### 7. Trip Calendar (`/calendar`)

Monthly calendar view showing trip activity.

- Calendar grid with trip counts displayed per day
- Color intensity varies based on trip volume
- Click a day to see trips for that date
- Navigation between months

### 8. Admin Panel (`/admin`)

Full CRUD management interface with two tabs.

**Trips Tab:**
- Sortable table of all trips with colored driver/trip-type badges
- Edit dialog for modifying any trip field (uses `DriverCombobox` for driver selection)
- Individual trip deletion with confirmation

**Drivers Tab:**
- Table of all drivers with status badges
- Edit dialog for name and status changes
- Delete driver with confirmation
- Add new driver button

### 9. Settings (`/settings`)

Configure the AI provider used for trip extraction.

- **Provider Toggle**: Switch between Cloud AI (Lovable AI Gateway) and Local Ollama
- **Cloud Settings**:
  - Model selector: Gemini 2.5 Flash (default), Gemini 2.5 Pro, Gemini 3 Flash Preview, Gemini 3 Pro Preview, GPT-5 Mini, GPT-5
- **Local Ollama Settings**:
  - Endpoint URL (default: `http://localhost:11434`)
  - Connection test button (verifies Ollama is running and shows available model count)
  - Model selector: Qwen2.5-VL 7B (default), Pixtral 12B, LLaVA 13B, MiniCPM-V 8B
  - Custom model name input for any Ollama-compatible model
- Settings persist in `localStorage` under key `extraction-settings`

---

## Database Schema

### `trips` Table

| Column | Type | Default | Nullable | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | No | Primary key |
| `member_name` | `text` | — | No | Patient name ("Last, First") |
| `trip_number` | `text` | — | No | "A" or "B" |
| `pickup_time` | `text` | — | No | 24h format "HH:MM" |
| `dropoff_time` | `text` | — | No | 24h format "HH:MM" |
| `status` | `text` | `'COMPLETED'` | No | COMPLETED, CANCELLED, PENDING |
| `mileage` | `numeric` | `null` | Yes | Miles driven |
| `date` | `date` | — | No | Trip date (YYYY-MM-DD) |
| `driver_name` | `text` | — | No | Driver who performed the trip |
| `pickup_address` | `text` | `null` | Yes | Pickup location |
| `dropoff_address` | `text` | `null` | Yes | Dropoff location |
| `source` | `text` | `'ocr'` | No | `"ocr"` or `"manual"` |
| `trip_id_reference` | `text` | `null` | Yes | ModivCare reference ID |
| `created_at` | `timestamptz` | `now()` | No | Record creation timestamp |
| `updated_at` | `timestamptz` | `now()` | No | Auto-updated via trigger |

**Unique Constraint**: `(date, driver_name, member_name, trip_number, pickup_time)` — prevents duplicate trip inserts from re-processing the same screenshot.

### `drivers` Table

| Column | Type | Default | Nullable | Notes |
|---|---|---|---|---|
| `id` | `uuid` | `gen_random_uuid()` | No | Primary key |
| `name` | `text` | — | No | Driver's display name |
| `status` | `text` | `'active'` | No | `"active"` or `"inactive"` |
| `created_at` | `timestamptz` | `now()` | No | Record creation timestamp |
| `updated_at` | `timestamptz` | `now()` | No | Auto-updated via trigger |

---

## Edge Function: `extract-trips`

**Location**: `supabase/functions/extract-trips/index.ts`

A Deno-based serverless function that processes ModivCare driver app screenshots using vision-capable AI models.

### How It Works

1. **Input**: Receives a base64-encoded image plus provider settings (`provider`, `cloudModel`, `ollamaUrl`, `ollamaModel`)
2. **System Prompt**: Instructs the AI to extract trip data from the "Completed Trips" view, including:
   - Driver name (from header)
   - Date (converted to YYYY-MM-DD)
   - Per-trip: member name, trip number (A/B), pickup/dropoff times (24h), mileage, addresses, trip reference ID
   - Cancellation detection (CANCELLED watermark overlay)
   - Missing time detection (has_pickup / has_dropoff flags)
3. **Tool Calling**: Uses OpenAI-compatible `tools` parameter with a structured `extract_trips` function schema to force valid JSON output
4. **Provider Routing**:
   - **Cloud**: Calls `https://ai.gateway.lovable.dev/v1/chat/completions` with `LOVABLE_API_KEY`
   - **Local**: Calls `{ollamaUrl}/v1/chat/completions` (Ollama's OpenAI-compatible endpoint)
5. **Post-Processing**: Categorizes extracted trips into:
   - `trips` — valid, complete trips
   - `review` — missing pickup or dropoff time (flagged with `review_reason`)
   - `skipped` — cancelled trips (excluded)
6. **Error Handling**: Specific responses for rate limits (429), credit exhaustion (402), and general failures

### JWT Verification

JWT verification is **disabled** for this function (`verify_jwt = false` in `config.toml`) since it doesn't access user-specific data.

---

## Billing Formula

Defined in `src/lib/billing.ts`:

```
Revenue per trip = $35.00 flat rate (for trips ≤ 10 miles)
                 + $2.25 per mile (for every mile over 10)
```

| Scenario | Mileage | Calculation | Revenue |
|---|---|---|---|
| Short trip | 5 mi | Flat rate | $35.00 |
| Exactly 10 mi | 10 mi | Flat rate | $35.00 |
| Long trip | 25 mi | $35 + (15 × $2.25) | $68.75 |
| No mileage | null | — | $0.00 |

---

## Key Components

### `AppSidebar`
Collapsible sidebar with two navigation groups:
- **Operations**: Dashboard, Extract Trips, All Trips, Manual Entry
- **Management**: Drivers, Billing, Calendar, Admin Panel, Settings

Uses shadcn `Sidebar` primitives with active route highlighting. Brand header shows "ModivCare Operations" with a truck icon.

### `DriverCombobox`
A reusable searchable dropdown for selecting or creating drivers:
- Popover + Command (cmdk) pattern
- Shows existing drivers as colored badge options (using `getDriverColor`)
- Supports free-text input for new driver names
- "Use & create" option auto-inserts new drivers into the database via `useInsertDriver`
- Used in: ExtractTrips, ManualEntry, AdminPanel (TripEditDialog)

### `ExportTripsDialog`
Modal dialog for CSV export with configurable field selection:
- Checkbox list of all exportable fields
- Select all / deselect all
- Generates and downloads CSV with proper escaping
- Used in: AllTrips, BillingReport

### `StatCard`
Animated metric display card:
- Icon, label, and formatted value
- Optional trend indicator
- Framer Motion entrance animation with staggered delays
- Used extensively on Dashboard and BillingReport

### `TripsTable`
Sortable data table for trip records:
- Column headers with sort arrows
- Search/filter input
- Color-coded driver name badges and trip type badges
- Pagination support
- Action column for edit/delete operations

---

## Custom Hooks

### `useTrips()`
TanStack Query wrapper for the `trips` table:
- `useTrips()` — fetches all trips ordered by date descending
- `useInsertTrips()` — bulk upsert with deduplication (`onConflict` on composite key, `ignoreDuplicates: true`)
- `useUpdateTrip()` — update a single trip by ID
- `useDeleteTrip()` — delete a single trip by ID
- `useDeleteAllTrips()` — delete all trips (with safety confirmation in UI)

### `useDrivers()`
TanStack Query wrapper for the `drivers` table:
- `useDrivers()` — fetches all drivers ordered by name
- `useInsertDriver()` — create a new driver
- `useUpdateDriver()` — update driver name/status
- `useDeleteDriver()` — delete a driver by ID

### `useExtractionSettings()`
Manages AI provider configuration persisted in `localStorage`:
- `settings.provider` — `"cloud"` or `"local"`
- `settings.cloudModel` — selected cloud model ID
- `settings.ollamaUrl` — Ollama endpoint URL
- `settings.ollamaModel` — selected local model name
- `updateSettings(patch)` — merges partial updates and persists

---

## Utility Libraries

### `billing.ts`
- `calculateBilling(miles)` — applies the NEMT billing formula
- `formatCurrency(amount)` — formats as `$XX.XX`

### `driverColors.ts`
- 12-color HSL palette with `bg`, `light`, and `text` variants per color
- `getDriverColor(name, allNames)` — deterministic color assignment based on sorted driver list position
- `getDriverColorByIndex(index)` — direct palette access
- `getTripTypeColor(tripNumber)` — teal for "A", purple for "B"
- Ensures consistent colors across all views (tables, badges, charts, cards)

### `utils.ts`
- `cn(...inputs)` — Tailwind class merge utility (clsx + tailwind-merge)

---

## Getting Started

### Cloud (Lovable)

The app is pre-configured to run on Lovable with Cloud backend. Simply open the project and start using it — no setup required.

### Local Development

For running entirely on your local machine with free tools, see the detailed guide:

📄 **[Local Setup Guide →](docs/LOCAL_SETUP.md)**

Covers PostgreSQL, Supabase CLI, Ollama, and environment configuration — all on free tier.
