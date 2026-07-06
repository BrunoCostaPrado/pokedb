#!/usr/bin/env node
/**
 * Import cards + prices from Limitless TCG for a given set.
 * Usage: node --env-file .env scripts/import-set.mjs <SET_CODE>
 * Example: node --env-file .env scripts/import-set.mjs SSP
 */
import { createClient } from "@libsql/client"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/libsql"
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core"

const setCode = process.argv[2]?.toUpperCase()
const forceReimport = process.argv.includes("--force")
if (!setCode) {
	console.error(
		"Usage: node --env-file .env scripts/import-set.mjs <SET_CODE> [--force]",
	)
	process.exit(1)
}

// ── DB schema inline ──
const createTable = (name) => `pokedb_${name}`

const cards = sqliteTable(createTable("pokedex_card"), {
	id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
	name: text().notNull(),
	setName: text("set_name").notNull(),
	cardNumber: text("card_number").notNull(),
	releaseYear: integer("release_year"),
	imageUrl: text("image_url"),
	createdAt: integer({ mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
})

const prices = sqliteTable(createTable("pokedex_price"), {
	id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
	cardId: integer("card_id").notNull(),
	price: real().notNull(),
	source: text().notNull().default("limitless"),
	fetchedAt: integer("fetched_at", { mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
})

// ── Scrape ──
const url = `https://limitlesstcg.com/cards/en/${setCode}?display=list`
console.log(`Fetching ${url} …`)

const res = await fetch(url)
if (!res.ok) {
	console.error(`HTTP ${res.status} fetching ${url}`)
	process.exit(1)
}
const html = await res.text()

// ── Extract set name (from first card row's data-tooltip) ──
const setNameMatch = html.match(/class="card-set"[^>]*data-tooltip="([^"]+)"/)
const setName = setNameMatch?.[1] ?? setCode
console.log(`Set: ${setName} (${setCode})`)

// ponytail: extract release year from date string in HTML
const dateMatch = html.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/)
const releaseYear = dateMatch ? Number.parseInt(dateMatch[3], 10) : null

// ── Parse card rows ──
const rows = html.match(/<tr[^>]*data-hover="[^"]*"[^>]*>[\s\S]*?<\/tr>/gi)
if (!rows || rows.length === 0) {
	console.error("No card rows found. Page structure may have changed.")
	process.exit(1)
}

const cardEntries = []
for (const row of rows) {
	const imageMatch = row.match(/data-hover="([^"]*)"/)
	const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
	if (cells.length < 7) continue

	// Number: <a href="...">123</a>
	const numMatch = cells[1]?.[1]?.match(/>(\d+)<\//)
	const number = numMatch?.[1]

	// Name: <a href="...">Name</a>
	const nameMatch = cells[2]?.[1]?.match(/>([^<]+)<\//)
	const name = nameMatch?.[1]?.trim()

	if (!number || !name) continue

	// Price: extract number from >$X.XX<
	const usdMatch = cells[5]?.[1]?.match(/>\$?([\d.]+)</)
	const priceUsd = usdMatch ? Number.parseFloat(usdMatch[1]) : null

	const imageUrl = imageMatch?.[1] || null

	cardEntries.push({
		number,
		name,
		priceUsd: priceUsd !== null && !Number.isNaN(priceUsd) ? priceUsd : null,
		imageUrl,
	})
}

console.log(`Parsed ${cardEntries.length} cards`)

// Early exit check
if (cardEntries.length === 0) {
	console.log("No cards to import. Exiting.")
	process.exit(0)
}

// ── Insert into DB ──
const client = createClient({ url: process.env.DATABASE_URL })
const db = drizzle(client)

let inserted = 0
let skipped = 0

if (forceReimport) {
	// FK cascade deletes prices
	const existing = await db
		.select({ id: cards.id })
		.from(cards)
		.where(sql`${cards.setName} = ${setName}`)
	if (existing.length > 0) {
		await db.delete(cards).where(sql`${cards.setName} = ${setName}`)
		console.log(`Deleted ${existing.length} existing cards for re-import`)
	}
}

for (const entry of cardEntries) {
	const existing = await db
		.select({ id: cards.id })
		.from(cards)
		.where(
			sql`${cards.setName} = ${setName} AND ${cards.cardNumber} = ${entry.number}`,
		)
		.limit(1)

	if (existing.length > 0) {
		skipped++
		continue
	}

	const [card] = await db
		.insert(cards)
		.values({
			name: entry.name,
			setName,
			cardNumber: entry.number,
			releaseYear,
			imageUrl: entry.imageUrl,
		})
		.returning({ id: cards.id })

	if (card && entry.priceUsd != null) {
		await db.insert(prices).values({
			cardId: card.id,
			price: entry.priceUsd,
			source: "limitless",
		})
	}

	inserted++
}

console.log(`Done. Inserted ${inserted}, skipped ${skipped} (already in DB).`)
client.close()
