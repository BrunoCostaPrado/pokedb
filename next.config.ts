/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js"

import type { NextConfig } from "next"

const config: NextConfig = {
	output: "standalone",
	images: {
		remotePatterns: [
			{
				hostname: "limitlesstcg.nyc3.cdn.digitaloceanspaces.com",
				protocol: "https",
			},
			{
				hostname: "images.pokemontcg.io",
				protocol: "https",
			},
		],
	},
}

export default config
