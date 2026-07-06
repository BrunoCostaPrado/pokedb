// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { relations, sql } from "drizzle-orm"
import { sqliteTableCreator } from "drizzle-orm/sqlite-core"

export const createTable = sqliteTableCreator((name) => `pokedb_${name}`)

export const cards = createTable("pokedex_card", (d) => ({
	id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
	name: d.text().notNull(),
	setName: d.text("set_name").notNull(),
	cardNumber: d.text("card_number").notNull(),
	releaseYear: d.integer("release_year"),
	imageUrl: d.text("image_url"),
	createdAt: d
		.integer({ mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
}))

export const prices = createTable("pokedex_price", (d) => ({
	id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
	cardId: d
		.integer("card_id")
		.notNull()
		.references(() => cards.id, { onDelete: "cascade" }),
	price: d.real().notNull(),
	source: d.text().notNull().default("manual"),
	fetchedAt: d
		.integer("fetched_at", { mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
}))

export const cardsRelations = relations(cards, ({ many }) => ({
	prices: many(prices),
}))

export const pricesRelations = relations(prices, ({ one }) => ({
	card: one(cards, {
		fields: [prices.cardId],
		references: [cards.id],
	}),
}))
