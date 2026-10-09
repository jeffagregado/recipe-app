import Link from 'next/link'

import PageContainer from '@/components/layout/page-container'

export default function RecipeNotFound() {
	return (
		<PageContainer size="default" className="space-y-4">
			<h1 className="text-3xl font-bold">Page not found</h1>
			<p className="text-muted-foreground">This recipe does not exist or is not available to you.</p>
			<Link href="/recipes" className="inline-flex min-h-11 items-center text-primary underline underline-offset-4">
				Back to Recipes
			</Link>
		</PageContainer>
	)
}
