"use client"

import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { api } from "@/trpc/react"

const OCR_URL = "http://localhost:8000"

export default function ScanPage() {
	const videoRef = useRef<HTMLVideoElement>(null)
	const fileRef = useRef<HTMLInputElement>(null)
	const [loading, setLoading] = useState(false)
	const [saved, setSaved] = useState(false)
	const [stream, setStream] = useState<MediaStream | null>(null)
	const [camError, setCamError] = useState<string | null>(null)

	const addCard = api.card.addCard.useMutation()
	const utils = api.useUtils()

	async function ocrAndSave(fd: FormData) {
		setLoading(true)
		setSaved(false)
		try {
			const res = await fetch(`${OCR_URL}/identify`, {
				method: "POST",
				body: fd,
			})
			const data: {
				text: string
				card_detected: boolean
				card_number?: string
				image?: string
				parsed_name?: string
				parsed_set_name?: string
			} = await res.json()

			// ponytail: auto-save via PTCG if found, else fall through to
			// addCard with OCR data (no user input needed).
			let hit: any
			const searchName = data.parsed_name || data.text
			if (searchName.trim()) {
				const hits = await utils.tcg.searchCards
					.fetch({ name: searchName, number: data.card_number })
					.catch(() => [])
				hit = hits[0]
			}

			let imageUrl: string | undefined = hit?.imageUrl
			if (!imageUrl && data.image)
				imageUrl = `data:image/jpeg;base64,${data.image}`

			const cardNumber = hit?.number ?? data.card_number ?? ""
			await addCard.mutateAsync({
				name: hit?.name ?? (data.parsed_name || data.text || "Unknown"),
				setName: hit?.setName ?? (data.parsed_set_name || "Unknown"),
				cardNumber: cardNumber || "???",
				releaseYear: hit?.releaseYear,
				imageUrl,
				initialPrice: hit?.marketPrice,
			})
			setSaved(true)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (videoRef.current && stream) videoRef.current.srcObject = stream
	}, [stream])

	async function startCamera() {
		setCamError(null)
		try {
			const s = await navigator.mediaDevices.getUserMedia({ video: true })
			setStream(s)
		} catch {
			setCamError("Camera access denied or unavailable")
		}
	}

	function stopCamera() {
		stream?.getTracks().forEach((t) => {
			t.stop()
		})
		setStream(null)
	}

	async function capture() {
		const video = videoRef.current
		if (!video) return
		const c = document.createElement("canvas")
		c.width = video.videoWidth
		c.height = video.videoHeight
		// biome-ignore lint: canvas in browser always has context
		const ctx = c.getContext("2d")!
		ctx.drawImage(video, 0, 0)
		const blob = await new Promise<Blob>((r) =>
			c.toBlob((b) => {
				if (b) r(b)
			}, "image/jpeg"),
		)
		const fd = new FormData()
		fd.append("file", blob, "card.jpg")
		await ocrAndSave(fd)
	}

	async function uploadImage(e: ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (!file) return
		const fd = new FormData()
		fd.append("file", file)
		await ocrAndSave(fd)
	}

	function reset() {
		setSaved(false)
	}

	return (
		<div className="mx-auto flex max-w-md flex-col gap-4 p-4">
			<h1 className="text-lg font-semibold">Scan Card</h1>
			{!stream ? (
				<button
					className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
					onClick={startCamera}
					type="button"
				>
					Start Camera
				</button>
			) : (
				<>
					{/* biome-ignore lint: camera preview, no audio */}
					<video
						autoPlay
						className="w-full rounded-lg border"
						playsInline
						ref={videoRef}
					/>
					<div className="flex gap-2">
						<button
							className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
							disabled={loading}
							onClick={capture}
							type="button"
						>
							{loading ? "Scanning…" : "Capture"}
						</button>
						<button
							className="rounded-lg bg-muted px-2 py-2"
							onClick={stopCamera}
							type="button"
						>
							Stop
						</button>
					</div>
				</>
			)}
			<div className="flex gap-2">
				<button
					className="rounded-lg bg-muted px-4 py-2"
					onClick={() => fileRef.current?.click()}
					type="button"
				>
					Upload
				</button>
				<input
					accept="image/*"
					className="hidden"
					onChange={uploadImage}
					ref={fileRef}
					type="file"
				/>
			</div>
			{camError && (
				<p className="text-destructive text-sm">
					Camera not available. Try uploading an image instead.
				</p>
			)}
			{saved && (
				<div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700">
					Card saved!
					<button
						className="ml-2 rounded bg-green-600/20 px-2 py-0.5 text-xs"
						onClick={reset}
						type="button"
					>
						Scan another
					</button>
				</div>
			)}
		</div>
	)
}
