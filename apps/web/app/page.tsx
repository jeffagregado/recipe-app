import { Utensils } from 'lucide-react'
import { Suspense } from 'react'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { HomeSession } from './_components/home-session'

export default function HomePage() {
	return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
		<section aria-labelledby="home-title" className="w-full max-w-md space-y-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
			<header className="space-y-3">
				<div className="flex size-11 items-center justify-center rounded-full bg-[#526619] text-white"><Utensils aria-hidden="true" size={22} /></div>
				<h1 id="home-title" className="text-3xl font-bold">My Recipes</h1>
				<p className="text-sm leading-6 text-muted-foreground">Your recipes, all in one place. A private kitchen collection, just for you.</p>
			</header>
			<SessionErrorBoundary>
				<Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Checking your session...</p>}><HomeSession /></Suspense>
			</SessionErrorBoundary>
		</section>
	</main>
}
