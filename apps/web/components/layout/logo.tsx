type RecipeCardMarkProps = {
	size: number
	/** The corner radius of the olive square in the 64-unit viewBox. The Apple touch icon passes 0 because iOS rounds it. */
	radius?: number
}

/** The decorative brand mark: a folded white recipe card with three olive lines on an olive rounded square. */
export function RecipeCardMark({ size, radius = 18 }: RecipeCardMarkProps) {
	return (
		<svg aria-hidden="true" width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
			<RecipeCard radius={radius} />
		</svg>
	)
}

function RecipeCard({ radius }: { radius: number }) {
	return (
		<>
			<rect width="64" height="64" rx={radius} fill="#526619" />
			<path d="M19 13 h18 l9 9 v29 a3 3 0 0 1 -3 3 h-24 a3 3 0 0 1 -3 -3 v-35 a3 3 0 0 1 3 -3 z" fill="#fff" />
			<path d="M37 13 v9 h9 z" fill="#c9d59a" />
			<rect x="23" y="29" width="18" height="3.5" rx="1.75" fill="#526619" />
			<rect x="23" y="36" width="18" height="3.5" rx="1.75" fill="#526619" />
			<rect x="23" y="43" width="11" height="3.5" rx="1.75" fill="#526619" />
		</>
	)
}

const LOCKUP_WIDTH = 254

/** The brand lockup: the recipe-card mark and "Rec/App" drawn as one SVG. Screen readers hear the one-word name, "Recapp". */
export function Logo({ height }: { height: number }) {
	return (
		<>
			<svg aria-hidden="true" height={height} width={(height * LOCKUP_WIDTH) / 64} viewBox={`0 0 ${LOCKUP_WIDTH} 64`} xmlns="http://www.w3.org/2000/svg" className="shrink-0 text-foreground">
				<RecipeCard radius={18} />
				<g fill="currentColor" fontSize="44" style={{ fontFamily: 'var(--font-geist-sans)' }}>
					<text x="78" y="47" fontWeight="700" letterSpacing="-1.6">Rec</text>
					<rect x="161.6" y="12" width="5.5" height="40" rx="2.75" transform="rotate(20 164.35 32)" className="fill-[#526619] dark:fill-[#9bb84a]" />
					<text x="176.6" y="47" fontWeight="300" letterSpacing="-1.2">App</text>
				</g>
			</svg>
			<span className="sr-only">Recapp</span>
		</>
	)
}
