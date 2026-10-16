import Image, { type StaticImageData } from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { AppToaster } from '@/components/layout/app-toaster'
import { LegalLinks } from '@/components/layout/legal-links'
import { Logo } from '@/components/layout/logo'
import { NoticeToast } from '@/components/layout/notice-toast'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { cn } from '@/lib/utils'
import band from '@/public/landing/band.jpg'
import featureCategories from '@/public/landing/feature-categories.jpg'
import featureIngredients from '@/public/landing/feature-ingredients.jpg'
import featurePhotos from '@/public/landing/feature-photos.jpg'
import featureServings from '@/public/landing/feature-servings.jpg'
import hero from '@/public/landing/hero.jpg'
import { LandingSession } from './_components/landing-session'

/*
 * Photos in public/landing are Unsplash photos (Unsplash License: free to use, no attribution required), resized here:
 * hero.jpg                 https://images.unsplash.com/photo-1495521821757-a1efb6729352
 * feature-photos.jpg       https://images.unsplash.com/photo-1556909114-f6e7ad7d3136
 * feature-servings.jpg     https://images.unsplash.com/photo-1504674900247-0877df9cc836
 * feature-ingredients.jpg  https://images.unsplash.com/photo-1466637574441-749b8f19452f
 * feature-categories.jpg   https://images.unsplash.com/photo-1498837167922-ddd27525d352
 * band.jpg                 https://images.unsplash.com/photo-1490645935967-10de6ba17061
 */

type Feature = { title: string; body: string; photo: StaticImageData | null; alt: string; className: string }

/** One cell per feature the app has today; the cell sizes make the grid's rhythm. */
const FEATURES: Feature[] = [
	{ title: 'Save recipes with photos and video links', body: 'A cover photo, a photo per step and a link to the video you cooked along to.', photo: featurePhotos, alt: 'Two people cooking together at a stove', className: 'md:col-span-7' },
	{ title: 'Scale the servings', body: 'Cooking for two or for ten? Change the servings and every amount follows.', photo: featureServings, alt: 'Three plated dishes on a wooden table', className: 'md:col-span-5' },
	{ title: 'Check off ingredients as you go', body: 'Tick each ingredient on your phone while you cook, with nothing to save.', photo: featureIngredients, alt: 'Chopped vegetables, eggs and herbs on a cutting board', className: 'md:col-span-4' },
	{ title: 'Categories and favorites', body: 'Tag recipes with your own categories and keep the ones you cook most a tap away.', photo: featureCategories, alt: 'Bowls of salad ingredients laid out on a table', className: 'md:col-span-4' },
	{ title: 'Search and sort on any screen', body: 'Find a recipe by name, then sort by newest, recently updated or title.', photo: null, alt: '', className: 'md:col-span-4' },
]

const sessionFallback = <span role="status" className="text-sm text-muted-foreground">Checking your session...</span>

function Session({ placement }: { placement: 'header' | 'hero' | 'band' }) {
	return (
		<SessionErrorBoundary>
			<Suspense fallback={sessionFallback}><LandingSession placement={placement} /></Suspense>
		</SessionErrorBoundary>
	)
}

export default function HomePage() {
	return (
		<AppToaster>
			<div className="flex min-h-dvh flex-col bg-background">
				<header className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
					<Link href="/" className="flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
						<Logo height={36} />
					</Link>
					<Session placement="header" />
				</header>

				<main className="flex flex-1 flex-col">
					<section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:pt-12 lg:pb-24">
						<div className="flex flex-col gap-6 lg:col-span-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700">
							<h1 className="text-4xl font-bold tracking-tight text-balance md:text-5xl lg:text-6xl lg:leading-[1.05]">My Recipes</h1>
							<p className="max-w-[40ch] text-lg leading-relaxed text-muted-foreground md:text-xl">Your recipes, all in one place. A private kitchen collection, just for you.</p>
							<div><Session placement="hero" /></div>
						</div>
						<div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-muted shadow-floating lg:col-span-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700">
							<Image src={hero} alt="A tablet showing a recipe on a kitchen counter beside a bowl of limes" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
						</div>
					</section>

					<section aria-labelledby="features-title" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
						<h2 id="features-title" className="mb-8 text-3xl font-bold tracking-tight text-balance md:text-4xl">Built for the way you cook at home</h2>
						<ul className="grid gap-4 md:grid-cols-12 md:gap-5">
							{FEATURES.map((feature) => (
								<li key={feature.title} className={cn('flex flex-col overflow-hidden rounded-2xl bg-accent/50 transition-transform motion-safe:hover:-translate-y-0.5', feature.className)}>
									{/* A fixed aspect below md; from md the photo fills whatever height its row takes, so the cells in a row line up. */}
									{feature.photo && (
										<div className="relative aspect-16/10 md:aspect-auto md:min-h-56 md:flex-1">
											<Image src={feature.photo} alt={feature.alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
										</div>
									)}
									<div className="flex flex-1 flex-col gap-2 p-5">
										<h3 className="text-lg font-semibold tracking-tight">{feature.title}</h3>
										<p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
									</div>
								</li>
							))}
						</ul>
					</section>

					<section aria-labelledby="band-title" className="relative isolate overflow-hidden">
						<Image src={band} alt="" fill sizes="100vw" className="-z-20 object-cover" />
						{/* Scrim so the copy and the button pass contrast on any crop of the photo. */}
						<div aria-hidden="true" className="absolute inset-0 -z-10 bg-foreground/60" />
						<div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-20 text-background sm:px-6 lg:px-8 lg:py-28">
							<h2 id="band-title" className="max-w-[20ch] text-3xl font-bold tracking-tight text-balance md:text-4xl">Keep every recipe you want to cook again.</h2>
							<Session placement="band" />
						</div>
					</section>
				</main>

				<LegalLinks />
			</div>
			{/* Shows the notice a redirect carries here, such as a verified email. It reads the search params, so it suspends on its own. */}
			<Suspense fallback={null}>
				<NoticeToast />
			</Suspense>
		</AppToaster>
	)
}
