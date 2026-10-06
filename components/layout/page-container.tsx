import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageContainerSize = 'default' | 'wide' | 'full'

type PageContainerProps = ComponentPropsWithoutRef<'main'> & {
	children: ReactNode
	size?: PageContainerSize
}

const sizeClasses: Record<PageContainerSize, string> = {
	default: 'max-w-6xl',
	wide: 'max-w-[1440px]',
	full: 'max-w-none',
}

export default function PageContainer({
	children,
	size = 'wide',
	className,
	...props
}: PageContainerProps) {
	return (
		<div
			className={cn(
				'mx-auto w-full',
				'px-4 py-4',
				'sm:px-5 sm:py-5',
				'lg:px-6 lg:py-6',
				'xl:px-8',
				sizeClasses[size],
				className,
			)}
			{...props}
		>
			{children}
		</div>
	)
}
