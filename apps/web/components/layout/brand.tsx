import Link from 'next/link'
import { Logo } from './logo'

/** The app's brand lockup, linking home to Recipes. Shared by the desktop sidebar and the mobile header. */
export function Brand() {
	return (
		<Link
			href="/recipes"
			className="flex w-fit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
		>
			<Logo height={40} />
		</Link>
	)
}
