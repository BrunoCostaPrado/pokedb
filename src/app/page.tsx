import { CardViewer } from "@/app/_components/card-viewer"
import { HydrateClient } from "@/trpc/server"

export default async function Home() {
	return (
		<HydrateClient>
			<main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
				<div className="container flex flex-col items-center gap-8 px-4 py-16">
					<h1 className="font-extrabold text-4xl tracking-tight sm:text-[4rem]">
						PokéDB
					</h1>
					<p className="text-lg text-white/60">
						Pokemon TCG card price tracker
					</p>
					<CardViewer />
				</div>
			</main>
		</HydrateClient>
	)
}
