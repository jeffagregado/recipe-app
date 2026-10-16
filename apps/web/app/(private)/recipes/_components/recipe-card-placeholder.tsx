import { RecipeCardMark } from '@/components/layout/logo'

/** The tile a card shows for a recipe with no photo: the brand mark on a tinted surface, so a list of them stays calm. */
export function RecipeCardPlaceholder() {
	return (
		<div aria-hidden="true" className="absolute inset-0 grid place-items-center bg-accent/60">
			<RecipeCardMark size={40} />
		</div>
	)
}
