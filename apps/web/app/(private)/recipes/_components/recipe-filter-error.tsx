import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export function RecipeFilterErrorView({ message }: { message: string }) {
	return <div role="alert" className="space-y-3">
		<p className="font-semibold">Invalid recipe filters.</p>
		<p className="text-sm text-muted-foreground">{message}</p>
		<Link href="/recipes" className={buttonVariants()}>Reset filters</Link>
	</div>
}
