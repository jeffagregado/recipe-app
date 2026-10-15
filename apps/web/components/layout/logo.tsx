type RecipeCardMarkProps = {
	size: number
	/** The corner radius of the olive square in the 64-unit viewBox. The Apple touch icon passes 0 because iOS rounds it. */
	radius?: number
}

/** The decorative brand mark: a folded white recipe card with three olive lines on an olive rounded square. */
export function RecipeCardMark({ size, radius = 18 }: RecipeCardMarkProps) {
	return (
		<svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
			<rect width="64" height="64" rx={radius} fill="#526619" />
			<path d="M19 13 h18 l9 9 v29 a3 3 0 0 1 -3 3 h-24 a3 3 0 0 1 -3 -3 v-35 a3 3 0 0 1 3 -3 z" fill="#fff" />
			<path d="M37 13 v9 h9 z" fill="#c9d59a" />
			<rect x="23" y="29" width="18" height="3.5" rx="1.75" fill="#526619" />
			<rect x="23" y="36" width="18" height="3.5" rx="1.75" fill="#526619" />
			<rect x="23" y="43" width="11" height="3.5" rx="1.75" fill="#526619" />
		</svg>
	)
}

/** The "Rec/App" lockup for the brand block. Screen readers hear the one-word name, "Recapp". */
export function Wordmark() {
	return (
		<>
			<span aria-hidden="true">
				<span className="font-bold">Rec</span>
				<span className="font-light text-[#526619] dark:text-[#9bb84a]">/</span>
				<span className="font-light">App</span>
			</span>
			<span className="sr-only">Recapp</span>
		</>
	)
}
