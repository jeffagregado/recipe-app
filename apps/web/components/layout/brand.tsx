import Link from 'next/link'
import { RecipeCardMark, Wordmark } from './logo'

/** The app's brand block, linking home to Recipes. Shared by the desktop sidebar and the mobile header. */
export function Brand() {
	return (
		<Link
			href="/recipes"
			className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-800 focus-visible:ring-offset-2"
		>
			<RecipeCardMark size={36} />

			<div className="min-w-0">
				<p className="truncate text-[15px] leading-5 text-foreground"><Wordmark /></p>

				<p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
					Private · Just for you
				</p>
			</div>
		</Link>
	)
}
