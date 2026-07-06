"use client"

export function PriceChart({
	data,
}: {
	data: { price: number; fetchedAt: Date }[]
}) {
	if (data.length < 2) return null

	const sorted = [...data].reverse()
	const prices = sorted.map((p) => p.price)
	const max = Math.max(...prices)
	const min = Math.min(...prices)
	const range = max - min || 1

	const w = 400
	const h = 180
	const pad = { top: 8, right: 8, bottom: 24, left: 52 }
	const plotW = w - pad.left - pad.right
	const plotH = h - pad.top - pad.bottom

	const xScale = (i: number) => pad.left + (i / (sorted.length - 1)) * plotW
	const yScale = (v: number) => pad.top + plotH - ((v - min) / range) * plotH

	const points = sorted
		.map((p, i) => `${xScale(i)},${yScale(p.price)}`)
		.join(" ")

	const gridLines = [0, 0.5, 1]
	const dateIndices = [0, Math.floor(sorted.length / 2), sorted.length - 1]

	return (
		<svg
			aria-label="Price history chart"
			className="h-48 w-full"
			role="img"
			viewBox={`0 0 ${w} ${h}`}
		>
			{gridLines.map((t) => {
				const y = pad.top + plotH * (1 - t)
				return (
					<g key={t}>
						<line
							stroke="oklch(0.922 0 0)"
							strokeWidth={1}
							x1={pad.left}
							x2={w - pad.right}
							y1={y}
							y2={y}
						/>
						<text
							fill="oklch(0.556 0 0)"
							fontSize={10}
							textAnchor="end"
							x={pad.left - 4}
							y={y + 3}
						>
							${(min + range * t).toFixed(2)}
						</text>
					</g>
				)
			})}
			{dateIndices.map(
				(i) =>
					sorted[i] && (
						<text
							fill="oklch(0.556 0 0)"
							fontSize={10}
							key={i}
							textAnchor="middle"
							x={xScale(i)}
							y={h - 4}
						>
							{new Date(sorted[i].fetchedAt).toLocaleDateString()}
						</text>
					),
			)}
			<polyline
				fill="none"
				points={points}
				stroke="hsl(142.1 76.2% 36.3%)"
				strokeWidth={2}
			/>
		</svg>
	)
}
