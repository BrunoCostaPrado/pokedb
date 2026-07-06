import type * as React from "react"

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={`flex flex-col gap-4 overflow-hidden rounded-xl bg-card text-card-foreground text-sm ring-1 ring-foreground/10 ${className ?? ""}`}
			{...props}
		/>
	)
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={`flex flex-col gap-1 px-4 ${className ?? ""}`} {...props} />
	)
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={`font-medium text-base leading-snug ${className ?? ""}`}
			{...props}
		/>
	)
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={`text-muted-foreground text-sm ${className ?? ""}`}
			{...props}
		/>
	)
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={`flex items-center border-t bg-muted/50 p-4 ${className ?? ""}`}
			{...props}
		/>
	)
}

export { Card, CardDescription, CardFooter, CardHeader, CardTitle }
