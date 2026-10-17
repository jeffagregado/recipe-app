import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { DemoSettings } from './demo-settings'

const renderSettings = () => render(<AppToaster><DemoSettings displayName="Demo visitor" /></AppToaster>)

it('keeps display name editing', () => {
	renderSettings()
	const displayName = screen.getByRole('region', { name: 'Display name' })
	expect(within(displayName).getByRole('textbox')).toHaveValue('Demo visitor')
	expect(within(displayName).getByRole('button', { name: 'Save name' })).toBeInTheDocument()
})

it.each(['Email', 'Password', 'Sign-in methods'])('says %s is not available in the demo, with nothing to fill in or press', (name) => {
	renderSettings()
	const section = screen.getByRole('region', { name })
	expect(section).toHaveTextContent('Not available in the demo')
	expect(within(section).queryByRole('textbox')).not.toBeInTheDocument()
	expect(within(section).queryByRole('button')).not.toBeInTheDocument()
})
