import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().url(),
		JUSTTCG_API_KEY: z.string().optional(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		JUSTTCG_API_KEY: process.env.JUSTTCG_API_KEY,
		NODE_ENV: process.env.NODE_ENV,
	},
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
})
