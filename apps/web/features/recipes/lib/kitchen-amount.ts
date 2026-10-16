/** The kitchen fractions amounts show as, with the Unicode glyph the amount field also accepts. */
export const KITCHEN_FRACTIONS = [
	{ glyph: '⅛', value: 1 / 8 }, { glyph: '¼', value: 1 / 4 }, { glyph: '⅓', value: 1 / 3 }, { glyph: '⅜', value: 3 / 8 },
	{ glyph: '½', value: 1 / 2 }, { glyph: '⅝', value: 5 / 8 }, { glyph: '⅔', value: 2 / 3 }, { glyph: '¾', value: 3 / 4 },
	{ glyph: '⅞', value: 7 / 8 },
] as const

// Stored quantities have three decimals (numeric(12,3)), so a stored ⅓ is 0.333.
const STORED_DECIMALS = 3
const SCALED_DECIMALS = 2
const SCALED_TOLERANCE = 0.01

const roundTo = (value: number, decimals: number) => Number(value.toFixed(decimals))
const decimalFormat = (decimals: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals, useGrouping: false })
const formats = { stored: decimalFormat(STORED_DECIMALS), scaled: decimalFormat(SCALED_DECIMALS) }

/**
 * Amount text with a kitchen fraction such as `1¼`, or a decimal when no fraction fits.
 * A stored amount shows a fraction only when that fraction is exactly what was stored, so the edit form round-trips it;
 * a scaled amount snaps to the nearest fraction within 0.01 and otherwise rounds to two decimals.
 */
export function kitchenAmount(value: number, kind: 'stored' | 'scaled'): string {
	const whole = Math.floor(value)
	const part = value - whole
	const fraction = KITCHEN_FRACTIONS.find((candidate) => kind === 'stored'
		? roundTo(candidate.value, STORED_DECIMALS) === roundTo(part, STORED_DECIMALS)
		: Math.abs(candidate.value - part) <= SCALED_TOLERANCE)
	if (!fraction) return formats[kind].format(value)
	return `${whole || ''}${fraction.glyph}`
}
