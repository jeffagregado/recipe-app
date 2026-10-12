import { Utensils } from 'lucide-react'
import Link from 'next/link'

/** The app's brand block, linking home to Recipes. Shared by the desktop sidebar and the mobile header. */
export function Brand() {
	return (
		<Link
			href="/recipes"
			className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-800 focus-visible:ring-offset-2"
		>
			<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#526619] text-white">
				<Utensils size={18} strokeWidth={2} />
			</div>

			<div className="min-w-0">
				<p className="truncate text-[15px] font-semibold leading-5 text-neutral-950">My Recipes</p>

				<p className="mt-0.5 truncate text-[11px] leading-4 text-neutral-500">
					Private · Just for you
				</p>
			</div>
		</Link>
	)
}
