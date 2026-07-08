# PokéDB

Pokemon TCG card price tracker.
Search, add, edit, delete cards. OCR card recognition. TCG price import.

## Stack

- **Next.js 16** — App Router, server components, standalone output
- **tRPC v11** — typed API (httpBatchStreamLink, SuperJSON)
- **Drizzle ORM** — SQLite via libsql
- **Tailwind CSS v4** — utility-first, zero-JS
- **Biome** — lint + format (no Prettier/ESLint)
- **Zod v4** — schema validation
- **EasyOCR + OpenCV 5** — card text recognition + contour detection
- **Docker Compose** — app + OCR server

## Setup

### Prerequisites

- Node.js 22+, pnpm 10
- Python 3.12+ (for OCR server, optional)

### App

```bash
pnpm install
cp .env.example .env
# edit DATABASE_URL in .env if needed (default: file:./dev.db)
pnpm db:push   # create SQLite tables
pnpm dev       # http://localhost:3000
```

### OCR server (optional, for scanning)

```bash
cd ocr-server
python -m venv venv
# Windows:
source venv/Scripts/activate
# Linux/macOS:
# source venv/bin/activate
pip install -r requirements.txt
python main.py  # http://localhost:8000
```

### Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `file:./dev.db` | SQLite DB path |
| `JUSTTCG_API_KEY` | no | — | API key for real-time pricing |
| `SKIP_ENV_VALIDATION` | no | — | Skip env check (Docker builds) |
| `NEXT_PUBLIC_OCR_URL` | no | `http://localhost:8000` | OCR server URL |

## Import cards from Limitless TCG

```bash
pnpm import-set SSP        # Surging Sparks
pnpm import-set SSP --force # delete + re-import
pnpm import-set PAF        # Paldean Fates
```

Fetches card list + prices from Limitless TCG, inserts into SQLite.
HTML cached 1h in `scripts/.cache/`.

## Docker

```bash
docker compose up -d
```

Starts both services:

- **app** — `localhost:3000` (Next.js standalone)
- **ocr** — `localhost:8000` (FastAPI OCR)

### Volumes

- `pokedb-data:/app/data` — persists SQLite DB across restarts.
  First run seeds from build image.

### Build details

- Multi-stage Dockerfile (deps → builder → runner)
- SQLite schema pushed via `drizzle-kit push` at build time
- Standalone Next.js output (~10MB image)
- OCR image installs CPU-only PyTorch (from pytorch.org CPU index, ~1.1GB)

## Project structure

```text
src/
  app/
    _components/card-viewer.tsx   — search grid, add/edit/delete dialog
    scan/page.tsx                  — camera/upload → OCR → auto-save
    api/trpc/[trpc]/route.ts      — tRPC HTTP handler
    layout.tsx, page.tsx          — root layout, home page
  components/
    ui/button.tsx, card.tsx, dialog.tsx, input.tsx  — native HTML wrappers
    price-chart.tsx               — SVG polyline chart (zero deps)
    theme-toggle.tsx              — dark mode toggle (localStorage)
  server/
    api/
      trpc.ts                     — tRPC init, context
      root.ts                     — router merge
      routers/card.ts             — CRUD + price update

    db/
      schema.ts                   — cards + prices tables + relations
      index.ts                    — DB client singleton
  trpc/
    react.tsx                     — client provider
    query-client.ts               — React Query config
  env.js                          — env validation (Zod)
ocr-server/
  main.py                         — FastAPI OCR server
  requirements.txt                — Python deps
  training-data/                  — local training images (gitignored)
scripts/
  import-set.mjs                  — Limitless TCG scraper
```

## Routes

| Path | Description |
| --- | --- |
| `/` | Card search, grid, add/edit/delete |
| `/scan` | Camera/upload → OCR → auto-save card |
| `/api/trpc/[trpc]` | tRPC API |
| `GET /health` (ocr:8000) | OCR server health |
| `POST /identify` (ocr:8000) | OCR card identification |

## API (tRPC)

### card

- `searchByName` — search cards with offset pagination (limit 50)
- `addCard` — insert card + optional initial price
- `updateCard` — edit card fields
- `updatePrice` — fetch current price from JustTCG, insert to history
- `deleteCard` — remove card (cascades prices)
- `getPriceHistory` — price records for a card (limit 100)

## Docker commands

```bash
# Build + start
docker compose up -d

# Rebuild without cache
docker compose build --no-cache

# Stop
docker compose down

# Remove volume (reset DB)
docker compose down -v
```

## Notes

- **No auth** — all procedures are public, local use only
- **Dark Reader** causes hydration mismatch — set to "light" mode on this site
- **Windows + Fish (MSYS2)**: use `source venv/Scripts/activate.fish`
  for Windows Python venvs
- JustTCG API key for card prices (optional, price lookups fail without it)
