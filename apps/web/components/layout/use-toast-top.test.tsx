import { render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import { useToastTop } from './use-toast-top'

function Raised({ value }: { value: string }) {
	useToastTop(value)
	return null
}

const toastTop = () => document.documentElement.style.getPropertyValue('--toast-top')

afterEach(() => { document.documentElement.style.removeProperty('--toast-top') })

it('raises the toast top while mounted and restores the previous value on unmount', () => {
	document.documentElement.style.setProperty('--toast-top', '85px')
	const { unmount } = render(<Raised value="146px" />)
	expect(toastTop()).toBe('146px')
	unmount()
	expect(toastTop()).toBe('85px')
})

it('removes the override on unmount when nothing was set before, so the root default applies again', () => {
	const { unmount } = render(<Raised value="146px" />)
	expect(toastTop()).toBe('146px')
	unmount()
	expect(toastTop()).toBe('')
})
