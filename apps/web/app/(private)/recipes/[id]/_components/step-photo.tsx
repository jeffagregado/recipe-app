'use client'

import { Maximize2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { RecipePhoto } from '@/features/recipes/components/recipe-photo'

type StepPhotoProps = {
	src: string
	stepNumber: number
}

/** A thumbnail button that opens the same photo large in a modal; focus returns to the button when it closes. */
export function StepPhoto({ src, stepNumber }: StepPhotoProps) {
	return (
		<Dialog>
			<DialogTrigger
				aria-label={`Open step ${stepNumber} photo`}
				className="group relative block aspect-4/3 w-full max-w-64 shrink-0 overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-40"
			>
				<RecipePhoto src={src} alt="" fill sizes="(min-width: 640px) 160px, 256px" className="object-cover" />
				<span aria-hidden="true" className="absolute right-1.5 bottom-1.5 flex size-6 items-center justify-center rounded-md bg-black/55 text-white">
					<Maximize2 className="size-3.5" />
				</span>
			</DialogTrigger>
			<DialogContent className="max-w-[calc(100%-1rem)] gap-3 p-2 sm:max-w-3xl">
				<RecipePhoto
					src={src}
					alt=""
					width={1600}
					height={1200}
					sizes="(min-width: 768px) 736px, 100vw"
					className="mx-auto h-auto max-h-[75dvh] w-auto max-w-full rounded-lg object-contain"
				/>
				<DialogTitle className="pb-1 text-center">{`Step ${stepNumber} photo`}</DialogTitle>
			</DialogContent>
		</Dialog>
	)
}
