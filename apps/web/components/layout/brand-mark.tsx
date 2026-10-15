import { RecipeCardMark, Wordmark } from './logo'

/** The recipe-card mark and the Rec/App wordmark, at the top of the auth card and the legal pages. */
export function BrandMark() {
	return (
		<span className="flex w-fit items-center gap-3 text-sm">
			<RecipeCardMark size={44} />
			<span><Wordmark /></span>
		</span>
	)
}
