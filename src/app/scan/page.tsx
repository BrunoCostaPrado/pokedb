"use client"

import { type ChangeEvent, useEffect, useRef, useState } from "react"
import { api } from "@/trpc/react"

const OCR_URL = "http://localhost:8000"

// ponytail: resize client-side before upload — reduces latency
function resizeCanvas(
	source: CanvasImageSource,
	srcW: number,
	srcH: number,
	maxPx = 1200,
): HTMLCanvasElement {
	let w = srcW
	let h = srcH
	if (w > maxPx || h > maxPx) {
		const r = Math.min(maxPx / w, maxPx / h)
		w = Math.round(w * r)
		h = Math.round(h * r)
	}
	const c = document.createElement("canvas")
	c.width = w
	c.height = h
	// biome-ignore lint/style/noNonNullAssertion: canvas 2d context always exists in browser
	c.getContext("2d")!.drawImage(source, 0, 0, w, h)
	return c
}

function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
	return new Promise((r) =>
		c.toBlob(
			(b) => {
				if (b) r(b)
			},
			"image/jpeg",
			0.85,
		),
	)
}

export default function ScanPage() {
	const videoRef = useRef<HTMLVideoElement>(null)
	const fileRef = useRef<HTMLInputElement>(null)
	const [loading, setLoading] = useState(false)
	const [saved, setSaved] = useState(false)
	const [stream, setStream] = useState<MediaStream | null>(null)
	const [camError, setCamError] = useState<string | null>(null)

	const addCard = api.card.addCard.useMutation()

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

			// ponytail: use OCR data directly, no external card search
			const imageUrl = data.image
				? `data:image/jpeg;base64,${data.image}`
				: undefined

			await addCard.mutateAsync({
				name: data.parsed_name || data.text || "Unknown",
				setName: data.parsed_set_name || "Unknown",
				cardNumber: data.card_number || "???",
				imageUrl,
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
		const c = resizeCanvas(video, video.videoWidth, video.videoHeight)
		const blob = await canvasToBlob(c)
		const fd = new FormData()
		fd.append("file", blob, "card.jpg")
		await ocrAndSave(fd)
	}

	async function uploadImage(e: ChangeEvent<HTMLInputElement>) {
		const files = Array.from(e.target.files ?? [])
		for (const file of files) {
			if (!file) continue
			const img = new Image()
			const url = URL.createObjectURL(file)
			await new Promise<void>((r) => {
				img.onload = () => r()
				img.src = url
			})
			URL.revokeObjectURL(url)
			const c = resizeCanvas(img, img.naturalWidth, img.naturalHeight)
			const blob = await canvasToBlob(c)
			const fd = new FormData()
			fd.append("file", blob, file.name)
			await ocrAndSave(fd)
		}
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
					multiple
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
