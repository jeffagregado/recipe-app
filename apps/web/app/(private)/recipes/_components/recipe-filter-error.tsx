import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function RecipeFilterErrorView({ message }: { message: string }) {
	return <div role="alert" className="space-y-3">
		<p className="font-semibold">Invalid recipe filters.</p>
		<p className="text-sm text-muted-foreground">{message}</p>
		<Button render={<Link href="/recipes" />}>Reset filters</Button>
	</div>
}
