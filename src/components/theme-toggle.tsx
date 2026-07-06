"use client"

import { useEffect, useState } from "react"

export function ThemeToggle() {
	const [dark, setDark] = useState(false)

	useEffect(() => {
		const stored = localStorage.getItem("theme")
		if (
			stored === "dark" ||
			(!stored && matchMedia("(prefers-color-scheme: dark)").matches)
		) {
			document.documentElement.classList.add("dark")
			setDark(true)
		}
	}, [])

	function toggle() {
		const next = !dark
		document.documentElement.classList.toggle("dark", next)
		localStorage.setItem("theme", next ? "dark" : "light")
		setDark(next)
	}

	return (
		<button
			aria-label="Toggle dark mode"
			className="rounded-md p-2 text-sm hover:bg-muted"
			onClick={toggle}
			type="button"
		>
			{dark ? "☀️" : "🌙"}
		</button>
	)
}
