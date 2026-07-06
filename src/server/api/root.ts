import { cardRouter } from "@/server/api/routers/card"
import { tcgRouter } from "@/server/api/routers/tcg"
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc"

export const appRouter = createTRPCRouter({
	card: cardRouter,
	tcg: tcgRouter,
})

export type AppRouter = typeof appRouter

export const createCaller = createCallerFactory(appRouter)
