import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SectionContainerProps = ComponentPropsWithoutRef<'section'> & {
	children: ReactNode
}

export default function SectionContainer({ children, className, ...props }: SectionContainerProps) {
	return (
		<section
			className={cn('rounded-xl border border-border bg-card', 'p-4 sm:p-5', className)}
			{...props}
		>
			{children}
		</section>
	)
}
