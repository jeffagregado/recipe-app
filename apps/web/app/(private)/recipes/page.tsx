import PageContainer from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { Plus, Search } from 'lucide-react'

import { Suspense } from 'react'
import { RecipeGrid } from './_components/recipe-grid'
import { RecipeErrorBoundary } from './_components/recipe-error'
import { RecipeLoading } from './_components/recipe-loading'

export default function RecipesPage({ searchParams }: PageProps<'/recipes'>) {
	return (
		<PageContainer size="full" className="space-y-8">
			<header className="grid grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1fr_60%_1fr]">
				<h1 className="text-3xl font-bold max-w-fit lg:text-5xl">Recipes</h1>
				<div className="relative order-3 col-span-2 md:order-0 md:col-span-1">
					<Search
						className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
						size={20}
					/>
					<Input
						aria-label="Search recipes"
						className="w-full pl-10"
						placeholder="Search recipes"
					/>
				</div>
				<Button className="justify-self-end" size="lg">
					<Plus /> New Recipe
				</Button>
			</header>
			<RecipeErrorBoundary message="Please try again in a moment.">
				<Suspense fallback={<RecipeLoading />}>
					<RecipeGrid searchParams={searchParams} />
				</Suspense>
			</RecipeErrorBoundary>
		</PageContainer>
	)
}
