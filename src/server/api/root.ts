import { cardRouter } from "@/server/api/routers/card"
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc"

export const appRouter = createTRPCRouter({
	card: cardRouter,
})

export type AppRouter = typeof appRouter

export const createCaller = createCallerFactory(appRouter)
