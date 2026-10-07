import PageContainer from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { Plus, Search } from 'lucide-react'

export default function RecipesPage() {
	return (
		<PageContainer size="full">
			<header className="grid grid-cols-[1fr_60%_1fr] items-center gap-4">
				<h1 className="text-5xl font-bold max-w-fit">Recipes</h1>
				<div className="relative">
          <Search className='absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground' size={20} />
					<Input className="w-full pl-10" placeholder="Search recipes" />
				</div>
				<Button className="justify-self-end" size='lg'>
					<Plus /> New Recipe
				</Button>
			</header>
		</PageContainer>
	)
}
