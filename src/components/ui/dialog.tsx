"use client"

import type * as React from "react"

function Dialog({
	open,
	onOpenChange,
	children,
}: {
	open: boolean
	onOpenChange: (v: boolean) => void
	children: React.ReactNode
}) {
	if (!open) return null
	return (
		<>
			<button
				aria-label="Close dialog"
				className="fixed inset-0 z-50 cursor-default bg-black/10"
				onClick={() => onOpenChange(false)}
				type="button"
			/>
			<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
				<div className="w-full max-w-sm rounded-xl bg-popover p-4 text-popover-foreground text-sm shadow-lg ring-1 ring-foreground/10">
					{children}
				</div>
			</div>
		</>
	)
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={`flex flex-col gap-2 ${className ?? ""}`} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={`flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 sm:flex-row sm:justify-end ${className ?? ""}`}
			{...props}
		/>
	)
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return (
		<h2
			className={`font-medium text-base leading-none ${className ?? ""}`}
			{...props}
		/>
	)
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			className={`text-muted-foreground text-sm ${className ?? ""}`}
			{...props}
		/>
	)
}

export { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle }
