import type * as React from "react"

type ButtonVariant =
	| "default"
	| "outline"
	| "secondary"
	| "ghost"
	| "destructive"
type ButtonSize = "default" | "sm" | "lg"

const variantStyles: Record<ButtonVariant, string> = {
	default: "bg-primary text-primary-foreground hover:bg-primary/80",
	outline: "border-border bg-background hover:bg-muted hover:text-foreground",
	secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
	ghost: "hover:bg-muted hover:text-foreground",
	destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20",
}

const sizeStyles: Record<ButtonSize, string> = {
	default: "h-8 px-2.5 gap-1.5",
	sm: "h-7 px-2.5 gap-1 text-[0.8rem]",
	lg: "h-9 px-2.5 gap-1.5",
}

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: React.ComponentProps<"button"> & {
	variant?: ButtonVariant
	size?: ButtonSize
}) {
	return (
		<button
			className={`inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 ${variantStyles[variant]} ${sizeStyles[size]} ${className ?? ""}`}
			{...props}
		/>
	)
}

export { Button }
