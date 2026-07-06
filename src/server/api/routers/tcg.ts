import { z } from "zod"
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc"

// ponytail: no auth needed for PTCG API v2 read-only search
const PTCG_API = "https://api.pokemontcg.io/v2"

export const tcgRouter = createTRPCRouter({
	searchCards: publicProcedure
		.input(z.object({ name: z.string().min(1), number: z.string().optional() }))
		.query(async ({ input }) => {
			const q = `name:${encodeURIComponent(input.name)}${input.number ? ` number:${encodeURIComponent(input.number)}` : ""}`
			const res = await fetch(
				`${PTCG_API}/cards?q=${q}&pageSize=10&select=id,name,set,number,images,tcgplayer`,
			)
			if (!res.ok) throw new Error("PTCG API error")
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const json: {
				data: {
					id: string
					name: string
					set: { id: string; name: string; releaseDate: string; series: string }
					number: string
					images: { small: string; large: string }
					tcgplayer: {
						url: string
						updatedAt: string
						prices: Record<string, { market: number }>
					}
				}[]
			} = await res.json()
			return json.data.map((c) => ({
				id: c.id,
				name: c.name,
				setName: c.set.name,
				setId: c.set.id,
				number: c.number,
				imageUrl: c.images.large,
				series: c.set.series,
				releaseYear: c.set.releaseDate
					? parseInt(c.set.releaseDate.split("-")[0] ?? "0", 10)
					: undefined,
				marketPrice:
					c.tcgplayer?.prices?.holofoil?.market ??
					c.tcgplayer?.prices?.normal?.market ??
					undefined,
			}))
		}),
})
