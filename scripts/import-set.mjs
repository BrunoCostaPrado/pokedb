#!/usr/bin/env node
/**
 * Import cards + prices from Limitless TCG for a given set.
 * Usage: node --env-file .env scripts/import-set.mjs <SET_CODE>
 * Example: node --env-file .env scripts/import-set.mjs SSP
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
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

// ponytail: file cache for HTML (1h TTL)
const cacheFile = new URL(`.cache/${setCode}.html`, import.meta.url)
let html
if (!forceReimport) {
	try {
		const { mtimeMs } = statSync(cacheFile)
		if (Date.now() - mtimeMs < 3_600_000) {
			html = readFileSync(cacheFile, "utf-8")
			console.log(
				`Using cached HTML (${Math.round((Date.now() - mtimeMs) / 1000)}s old)`,
			)
		}
	} catch {
		/* cache miss */
	}
}

// ── Scrape ──
if (!html) {
	const url = `https://limitlesstcg.com/cards/en/${setCode}?display=list`
	console.log(`Fetching ${url} …`)
	const res = await fetch(url)
	if (!res.ok) {
		console.error(`HTTP ${res.status} fetching ${url}`)
		process.exit(1)
	}
	html = await res.text()
	mkdirSync(new URL(".cache/", import.meta.url), { recursive: true })
	writeFileSync(cacheFile, html)
}

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

// ── Download training images (--images flag) ──
if (process.argv.includes("--images")) {
	const trainingDir = new URL("../ocr-server/training-data/", import.meta.url)
	mkdirSync(trainingDir, { recursive: true })
	let dl = 0
	for (const entry of cardEntries) {
		if (!entry.imageUrl) continue
		const filename = `${setCode}-${entry.number}.jpg`
		const dest = new URL(filename, trainingDir)
		try {
			if (statSync(dest)) continue
		} catch {
			/* new file */
		}
		try {
			const res = await fetch(entry.imageUrl)
			if (!res.ok) continue
			writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
			dl++
		} catch {
			/* skip failed download */
		}
	}
	console.log(`Downloaded ${dl} training images to ocr-server/training-data/`)
}

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

// ── JustTCG prices (auto if JUSTTCG_API_KEY set) ──
const justtcgKey = process.env.JUSTTCG_API_KEY
if (justtcgKey) {
	const setRes = await fetch(
		`https://api.justtcg.com/v1/sets?game=pokemon&q=${encodeURIComponent(setName)}`,
		{ headers: { "x-api-key": justtcgKey } },
	)
	if (setRes.ok) {
		const setJson = await setRes.json()
		const setId = setJson.data?.[0]?.id
		if (setId) {
			const cardRes = await fetch(
				`https://api.justtcg.com/v1/cards?game=pokemon&set=${setId}&limit=100`,
				{ headers: { "x-api-key": justtcgKey } },
			)
			if (cardRes.ok) {
				const cardJson = await cardRes.json()
				const dbCards = await db
					.select({
						id: cards.id,
						name: cards.name,
						cardNumber: cards.cardNumber,
					})
					.from(cards)
					.where(sql`${cards.setName} = ${setName}`)
				let jp = 0
				// ponytail: match by number first, then name fallback
				const justtcgCards = cardJson.data || []
				for (const dbc of dbCards) {
					const jc = justtcgCards.find(
						(c) =>
							(c.number && c.number === dbc.cardNumber) ||
							c.name.toLowerCase().includes(dbc.name.toLowerCase()),
					)
					const price = jc?.variants?.[0]?.price
					if (price != null) {
						await db
							.insert(prices)
							.values({ cardId: dbc.id, price, source: "justtcg" })
						jp++
					}
				}
				console.log(`JustTCG prices added: ${jp}`)

				// ── TCGPlayer image fallback (--images flag) ──
				if (process.argv.includes("--images")) {
					const trainingDir = new URL(
						"../ocr-server/training-data/",
						import.meta.url,
					)
					let dl = 0
					for (const jc of justtcgCards) {
						const cid = jc.tcgplayerId
						if (!cid) continue
						const filename = `${setCode}-${jc.number || "???"}.jpg`
						const dest = new URL(filename, trainingDir)
						try {
							if (statSync(dest)) continue
						} catch {
							/* new */
						}
						const sizes = ["_200w", "_400w", "_1100w"]
						for (const sz of sizes) {
							const url = `https://tcgplayer-cdn.tcgplayer.com/product/${cid}${sz}.jpg`
							try {
								const r = await fetch(url)
								if (
									r.ok &&
									r.headers.get("content-type")?.startsWith("image/")
								) {
									writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
									dl++
									break
								}
							} catch {
								/* try next size */
							}
						}
					}
					if (dl) console.log(`TCGPlayer images added: ${dl}`)
				}
			}
		}
	}
}

// ── Build template index (--images flag) ──
if (process.argv.includes("--images")) {
	const trainingDir = new URL("../ocr-server/training-data/", import.meta.url)
	const idx = {}
	for (const entry of cardEntries) {
		const key = `${setCode}-${entry.number}`
		const dest = new URL(`${key}.jpg`, trainingDir)
		try {
			if (statSync(dest))
				idx[key] = {
					name: entry.name,
					set_name: setName,
					number: entry.number,
					set_code: setCode,
				}
		} catch {
			/* not on disk */
		}
	}
	writeFileSync(
		new URL("_templates.json", trainingDir),
		JSON.stringify(idx, null, 2),
	)
	console.log(`Template index: ${Object.keys(idx).length} entries`)
}

console.log(`Done. Inserted ${inserted}, skipped ${skipped} (already in DB).`)
client.close()
