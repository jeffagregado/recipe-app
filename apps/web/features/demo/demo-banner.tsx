import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ResetDemoButton } from './reset-demo-button'

const REPOSITORY_URL = 'https://github.com/jeffagregado/recipe-app'

/** Above every signed-in page of the demo site: what this is, Reset demo, and the code behind it. */
export function DemoBanner() {
	return (
		<section aria-label="Demo" className="border-b border-sidebar-border bg-accent text-accent-foreground">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
				<p className="min-w-0 flex-1 basis-64 text-sm">
					<span className="font-medium">You are using the Recapp demo.</span> Your changes are private and last 24 hours.
				</p>
				<div className="flex flex-wrap items-center gap-2">
					<ResetDemoButton />
					<a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9')}>
						Code on GitHub
						<ExternalLink aria-hidden="true" />
						{' '}<span className="sr-only">(opens in a new tab)</span>
					</a>
				</div>
			</div>
		</section>
	)
}
