# PokéDB

Pokemon TCG card price tracker. Search, add, edit, delete cards with OCR card recognition and TCG price import.

## Stack

- **Next.js 16** — App Router, server components
- **tRPC v11** — typed API
- **Drizzle ORM** — SQLite (Turso/libsql)
- **Tailwind CSS v4** — utility-first styling
- **Biome** — lint + format
- **Zod** — schema validation
- **EasyOCR** — card text recognition
- **Docker** — app + OCR server

## Setup

```bash
pnpm install
cp .env.example .env   # edit DATABASE_URL if needed
pnpm db:push           # create tables
pnpm dev               # http://localhost:3000
```

OCR server (optional, for card scanning):

```bash
pip install -r ocr-server/requirements.txt
python ocr-server/main.py  # http://localhost:8000
```

## Import cards

```bash
pnpm import-set SSP        # Surging Sparks
pnpm import-set SSP --force # re-import
```

## Docker

```bash
docker compose build --no-cache
docker compose up
```

App at `http://localhost:3000`, OCR at `http://localhost:8000`.

## Routes

- `/` — card search, grid, add/edit/delete
- `/scan` — camera/upload OCR auto-save
- `/api/trpc/[trpc]` — tRPC API
