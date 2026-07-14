"use client"

import Image from "next/image"
import { useDeferredValue, useEffect, useState } from "react"
import { PriceChart } from "@/components/price-chart"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Dialog,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { api } from "@/trpc/react"

export function CardViewer() {
	const [search, setSearch] = useState("")
	const deferredSearch = useDeferredValue(search)
	const [allCards, setAllCards] = useState<NonNullable<typeof results.data>>([])
	const [offset, setOffset] = useState(0)

	const results = api.card.searchByName.useQuery({
		name: deferredSearch,
		offset,
	})

	// ponytail: accumulate pages client-side; reset on new search
	// biome-ignore lint/correctness/useExhaustiveDependencies: deferredSearch triggers reset
	useEffect(() => {
		setAllCards([])
		setOffset(0)
	}, [deferredSearch])

	useEffect(() => {
		const data = results.data
		if (data) {
			setAllCards((prev) => {
				const merged = offset === 0 ? data : [...prev, ...data]
				// ponytail: deduplicate by id — pagination can overlap
				const seen = new Set<number>()
				return merged.filter((c) => {
					if (seen.has(c.id)) return false
					seen.add(c.id)
					return true
				})
			})
		}
	}, [results.data, offset])

	const hasMore = (results.data?.length ?? 0) >= 50

	return (
		<div className="w-full max-w-4xl space-y-6">
			<Input
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search Pokemon card by name..."
				value={search}
			/>

			<CardFormDialog
				onSuccess={() => {
					setSearch("")
					results.refetch()
				}}
			/>

			{results.isLoading && allCards.length === 0 && (
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
					{Array.from({ length: 6 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div className="h-48 animate-pulse rounded-lg bg-muted" key={i} />
					))}
				</div>
			)}

			{results.isError && (
				<p className="text-center text-red-500">
					Error loading cards. {results.error?.message}
				</p>
			)}

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
				{allCards.map((card) => (
					<CardDisplay
						card={card}
						key={card.id}
						onUpdated={() => results.refetch()}
					/>
				))}
			</div>

			{hasMore && (
				<div className="flex justify-center">
					<Button
						disabled={results.isFetching}
						onClick={() => setOffset((o) => o + 50)}
						variant="outline"
					>
						{results.isFetching ? "Loading..." : "Load More"}
					</Button>
				</div>
			)}
		</div>
	)
}

function CardDisplay({
	card,
	onUpdated,
}: {
	card: {
		id: number
		name: string
		setName: string
		cardNumber: string
		releaseYear: number | null
		imageUrl: string | null
		prices: {
			id: number
			cardId: number
			price: number
			source: string
			fetchedAt: Date
		}[]
	}
	onUpdated: () => void
}) {
	const [showHistory, setShowHistory] = useState(false)
	const latestPrice = card.prices[0]
	const deleteCard = api.card.deleteCard.useMutation({
		onSuccess: onUpdated,
	})
	const updatePrice = api.card.updatePrice.useMutation({
		onSuccess: onUpdated,
	})
	const history = api.card.getPriceHistory.useQuery(
		{ id: card.id },
		{ enabled: showHistory },
	)

	return (
		<Card>
			{card.imageUrl && (
				<div className="relative h-40 w-full">
					<Image
						alt={card.name}
						className="rounded-t-lg object-contain"
						fill
						priority
						sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
						src={card.imageUrl}
					/>
				</div>
			)}
			<CardHeader>
				<CardTitle className="text-lg">{card.name}</CardTitle>
				<CardDescription>
					{card.setName} #{card.cardNumber}
					{card.releaseYear && <> · {card.releaseYear}</>}
				</CardDescription>
			</CardHeader>
			<CardFooter className="flex justify-between">
				{latestPrice && (
					<p className="font-semibold text-green-500 text-lg">
						${latestPrice.price.toFixed(2)}
					</p>
				)}
				<div className="flex gap-2">
					<Button
						disabled={updatePrice.isPending}
						onClick={() => updatePrice.mutate({ id: card.id })}
						size="sm"
						variant="outline"
					>
						{updatePrice.isPending ? "..." : "Update Price"}
					</Button>
					<Button
						disabled={deleteCard.isPending}
						onClick={() => {
							if (window.confirm(`Delete ${card.name}?`)) {
								deleteCard.mutate({ id: card.id })
							}
						}}
						size="sm"
						variant="destructive"
					>
						{deleteCard.isPending ? "..." : "Delete"}
					</Button>
					<CardFormDialog card={card} onSuccess={onUpdated} />
				</div>
			</CardFooter>
			{latestPrice && (
				<div className="px-4 pb-4">
					<button
						className="text-muted-foreground text-xs hover:text-foreground"
						onClick={() => setShowHistory(!showHistory)}
						type="button"
					>
						{showHistory ? "Hide" : "Show"} Price History
					</button>
					{showHistory && history.data && <PriceChart data={history.data} />}
				</div>
			)}
		</Card>
	)
}

function CardFormDialog({
	card,
	onSuccess,
}: {
	card?: {
		id: number
		name: string
		setName: string
		cardNumber: string
		releaseYear: number | null
		imageUrl: string | null
	}
	onSuccess: () => void
}) {
	const isEdit = !!card
	const [open, setOpen] = useState(false)
	const [cardName, setCardName] = useState(card?.name ?? "")
	const [cardSet, setCardSet] = useState(card?.setName ?? "")
	const [cardNumber, setCardNumber] = useState(card?.cardNumber ?? "")
	const [releaseYear, setReleaseYear] = useState(
		card?.releaseYear?.toString() ?? "",
	)
	const [imageUrl, setImageUrl] = useState(card?.imageUrl ?? "")
	const [price, setPrice] = useState("")
	const addCard = api.card.addCard.useMutation({
		onSuccess: () => {
			setOpen(false)
			resetForm()
			onSuccess()
		},
	})

	const updateCard = api.card.updateCard.useMutation({
		onSuccess: () => {
			setOpen(false)
			onSuccess()
		},
	})

	function resetForm() {
		setCardName("")
		setCardSet("")
		setCardNumber("")
		setReleaseYear("")
		setImageUrl("")
		setPrice("")
	}

	return (
		<>
			<Button
				onClick={() => setOpen(true)}
				size={isEdit ? "sm" : "default"}
				variant={isEdit ? "ghost" : "outline"}
			>
				{isEdit ? "Edit" : "+ Add Card"}
			</Button>
			<Dialog key={card?.id ?? "add"} onOpenChange={setOpen} open={open}>
				<DialogHeader>
					<div className="flex items-center gap-2">
						<DialogTitle>
							{isEdit ? "Edit Card" : "Add Pokemon Card"}
						</DialogTitle>
						<button
							aria-label="Close"
							className="ml-auto size-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							onClick={() => setOpen(false)}
							type="button"
						>
							✕
						</button>
					</div>
					<DialogDescription>
						{isEdit
							? "Update card details."
							: "Search Pokemon TCG API or enter details manually."}
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-3"
					onSubmit={(e) => {
						e.preventDefault()
						if (isEdit) {
							updateCard.mutate({
								id: card.id,
								name: cardName,
								setName: cardSet,
								cardNumber,
								releaseYear: releaseYear ? parseInt(releaseYear, 10) : null,
								imageUrl: imageUrl || null,
							})
						} else {
							addCard.mutate({
								name: cardName,
								setName: cardSet,
								cardNumber,
								releaseYear: releaseYear
									? parseInt(releaseYear, 10)
									: undefined,
								imageUrl: imageUrl || undefined,
								initialPrice: price ? parseFloat(price) : undefined,
							})
						}
					}}
				>
					<Input
						onChange={(e) => setCardName(e.target.value)}
						placeholder="Name *"
						required
						value={cardName}
					/>
					<Input
						onChange={(e) => setCardSet(e.target.value)}
						placeholder="Set Name *"
						required
						value={cardSet}
					/>
					<Input
						onChange={(e) => setCardNumber(e.target.value)}
						placeholder="Card Number *"
						required
						value={cardNumber}
					/>
					<Input
						onChange={(e) => setReleaseYear(e.target.value)}
						placeholder="Release Year"
						value={releaseYear}
					/>
					<Input
						onChange={(e) => setImageUrl(e.target.value)}
						placeholder="Image URL"
						value={imageUrl}
					/>
					{!isEdit && (
						<Input
							onChange={(e) => setPrice(e.target.value)}
							placeholder="Initial Price (from TCG)"
							step="0.01"
							type="number"
							value={price}
						/>
					)}
					<DialogFooter>
						<Button
							disabled={addCard.isPending || updateCard.isPending}
							type="submit"
						>
							{addCard.isPending || updateCard.isPending
								? isEdit
									? "Saving..."
									: "Adding..."
								: isEdit
									? "Save"
									: "Add Card"}
						</Button>
					</DialogFooter>
				</form>
			</Dialog>
		</>
	)
}
