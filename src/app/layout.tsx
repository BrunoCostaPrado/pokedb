import "@/styles/globals.css"

import type { Metadata } from "next"
import { Geist } from "next/font/google"

import { TRPCReactProvider } from "@/trpc/react"

export const metadata: Metadata = {
	title: "PokéDB",
	description: "Pokemon TCG card price tracker",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
	other: { darkreader: "light" },
}

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
})

import { ThemeToggle } from "@/components/theme-toggle"

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html className={`${geist.variable}`} lang="en" suppressHydrationWarning>
			<body suppressHydrationWarning>
				<div className="fixed right-4 top-4 z-50">
					<ThemeToggle />
				</div>
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	)
}
