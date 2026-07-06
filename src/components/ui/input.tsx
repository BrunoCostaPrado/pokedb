import type * as React from "react"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			className={`h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm ${className ?? ""}`}
			type={type}
			{...props}
		/>
	)
}

export { Input }
