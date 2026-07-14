import { desc, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { env } from "@/env"
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc"
import { cards, prices } from "@/server/db/schema"

export const cardRouter = createTRPCRouter({
	getPriceHistory: publicProcedure
		.input(z.object({ id: z.number() }))
		.query(async ({ ctx, input }) => {
			return await ctx.db.query.prices.findMany({
				where: eq(prices.cardId, input.id),
				orderBy: [desc(prices.fetchedAt)],
				limit: 100,
			})
		}),

	searchByName: publicProcedure
		.input(
			z.object({ name: z.string().default(""), offset: z.number().default(0) }),
		)
		.query(async ({ ctx, input }) => {
			const result = await ctx.db.query.cards.findMany({
				...(input.name
					? { where: sql`${cards.name} LIKE ${`%${input.name}%`}` }
					: {}),
				orderBy: [desc(cards.id)],
				limit: 50,
				offset: input.offset,
				with: {
					prices: {
						orderBy: [desc(prices.fetchedAt)],
						limit: 1,
					},
				},
			})
			return result
		}),

	addCard: publicProcedure
		.input(
			z.object({
				name: z.string().min(1),
				setName: z.string().min(1),
				cardNumber: z.string().min(1),
				releaseYear: z.number().int().optional(),
				imageUrl: z.string().optional(),
				initialPrice: z.number().positive().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [card] = await ctx.db
				.insert(cards)
				.values({
					name: input.name,
					setName: input.setName,
					cardNumber: input.cardNumber,
					releaseYear: input.releaseYear,
					// ponytail: store CDN URL directly, no local file write
					imageUrl: input.imageUrl,
				})
				.returning()

			if (!card) throw new Error("Failed to create card")

			if (input.initialPrice !== undefined) {
				await ctx.db.insert(prices).values({
					cardId: card.id,
					price: input.initialPrice,
					source: "manual",
				})
			}

			return card
		}),

	updateCard: publicProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1).optional(),
				setName: z.string().min(1).optional(),
				cardNumber: z.string().min(1).optional(),
				releaseYear: z.number().int().optional().nullable(),
				imageUrl: z.string().optional().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...updates } = input
			const cleaned = Object.fromEntries(
				Object.entries(updates).filter(([_, v]) => v !== undefined),
			)
			if (Object.keys(cleaned).length === 0) {
				throw new Error("No fields to update")
			}
			const [card] = await ctx.db
				.update(cards)
				.set(cleaned)
				.where(eq(cards.id, id))
				.returning()
			if (!card) throw new Error("Card not found")
			return card
		}),

	updatePrice: publicProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const card = await ctx.db.query.cards.findFirst({
				where: eq(cards.id, input.id),
			})
			if (!card) throw new Error("Card not found")

			// ponytail: naive JustTCG lookup by set+name.
			let price: number | undefined
			const source = "justtcg"

			if (env.JUSTTCG_API_KEY) {
				try {
					// step 1: find set slug
					const setRes = await fetch(
						`https://api.justtcg.com/v1/sets?game=pokemon&q=${encodeURIComponent(card.setName)}`,
						{ headers: { "x-api-key": env.JUSTTCG_API_KEY } },
					)
					if (setRes.ok) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						const setJson: { data: { id: string }[] } = await setRes.json()
						const setId = setJson.data[0]?.id
						if (setId) {
							// step 2: find card in set
							const cardRes = await fetch(
								`https://api.justtcg.com/v1/cards?game=pokemon&set=${setId}&limit=100`,
								{ headers: { "x-api-key": env.JUSTTCG_API_KEY } },
							)
							if (cardRes.ok) {
								// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
								const cardJson: {
									data: { name: string; variants: { price: number }[] }[]
								} = await cardRes.json()
								const match = cardJson.data.find((c) =>
									c.name.toLowerCase().includes(card.name.toLowerCase()),
								)
								price = match?.variants[0]?.price
							}
						}
					}
				} catch {
					// JustTCG failed
				}
			}

			if (price === undefined) throw new Error("Price not found")

			await ctx.db.insert(prices).values({
				cardId: card.id,
				price,
				source,
			})
			return { price, source }
		}),

	searchByOcrText: publicProcedure
		.input(z.object({ text: z.string() }))
		.query(async ({ input }) => {
			// ponytail: fallback when card reference fails — search JustTCG
			if (!env.JUSTTCG_API_KEY) return null
			const text = input.text.trim()
			if (!text) return null

			try {
				// Try direct card search first
				const cardRes = await fetch(
					`https://api.justtcg.com/v1/cards?game=pokemon&q=${encodeURIComponent(text)}&limit=5`,
					{ headers: { "x-api-key": env.JUSTTCG_API_KEY } },
				)
				if (cardRes.ok) {
					const json: {
						data: { name: string; number: string; set_id: string }[]
					} = await cardRes.json()
					const hit = json.data?.[0]
					if (hit) {
						const setId = hit.set_id
						const imageUrl = `https://www.limitlesstcg.com/cards/en/${setId}/${hit.number}.png`
						// Need set name — fetch set
						const setRes = await fetch(
							`https://api.justtcg.com/v1/sets/${setId}`,
							{ headers: { "x-api-key": env.JUSTTCG_API_KEY } },
						)
						const setName = setRes.ok
							? ((await setRes.json()) as { name: string }).name
							: setId
						return {
							name: hit.name,
							setName,
							cardNumber: hit.number,
							imageUrl,
						}
					}
				}

				// Fallback: search sets, then cards in first set
				const setRes = await fetch(
					`https://api.justtcg.com/v1/sets?game=pokemon&q=${encodeURIComponent(text)}`,
					{ headers: { "x-api-key": env.JUSTTCG_API_KEY } },
				)
				if (!setRes.ok) return null
				const setJson: { data: { id: string; name: string }[] } =
					await setRes.json()
				const setId = setJson.data[0]?.id
				const setName = setJson.data[0]?.name
				if (!setId) return null

				const cardRes2 = await fetch(
					`https://api.justtcg.com/v1/cards?game=pokemon&set=${setId}&limit=100`,
					{ headers: { "x-api-key": env.JUSTTCG_API_KEY } },
				)
				if (!cardRes2.ok) return null
				const cardJson: {
					data: { name: string; number: string }[]
				} = await cardRes2.json()
				const hit = cardJson.data?.[0]
				if (!hit) return null

				return {
					name: hit.name,
					setName: setName ?? setId,
					cardNumber: hit.number,
					imageUrl: `https://www.limitlesstcg.com/cards/en/${setId}/${hit.number}.png`,
				}
			} catch {
				return null
			}
		}),

	deleteCard: publicProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const [card] = await ctx.db
				.delete(cards)
				.where(eq(cards.id, input.id))
				.returning()
			if (!card) throw new Error("Card not found")
			return card
		}),
})
