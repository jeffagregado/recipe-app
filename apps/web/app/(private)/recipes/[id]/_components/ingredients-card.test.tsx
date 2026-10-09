import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { IngredientsCard } from './ingredients-card'

const ingredients = [
	{ id: 'i1', name: 'Spaghetti', quantity: 200, unit: 'g' as const },
	{ id: 'i2', name: 'Butter', quantity: 1, unit: 'tbsp' as const },
	{ id: 'i3', name: 'Garlic', quantity: 4, unit: 'clove' as const },
	{ id: 'i4', name: 'Salt', quantity: null, unit: null },
]

const rows = () => within(screen.getByRole('list', { name: 'Ingredients' })).getAllByRole('listitem')
const amounts = () => rows().map((row) => row.querySelector('label')?.lastElementChild?.textContent)
const decrease = () => screen.getByRole('button', { name: 'Decrease servings' })
const increase = () => screen.getByRole('button', { name: 'Increase servings' })

it('shows each ingredient with its amount, "to taste" for rows without one', () => {
	render(<IngredientsCard ingredients={ingredients} servings={null} />)
	expect(amounts()).toEqual(['200 g', '1 tbsp', '4 clove', 'to taste'])
})

it('strikes an ingredient and its amount through when it is checked and restores it when unchecked', async () => {
	const user = userEvent.setup()
	render(<IngredientsCard ingredients={ingredients} servings={null} />)
	const box = screen.getByRole('checkbox', { name: /Butter/ })
	expect(box).not.toBeChecked()
	await user.click(box)
	expect(box).toBeChecked()
	expect(screen.getByText('Butter')).toHaveClass('line-through')
	expect(screen.getByText('1 tbsp')).toHaveClass('line-through')
	expect(screen.getByText('Spaghetti')).not.toHaveClass('line-through')
	await user.click(box)
	expect(box).not.toBeChecked()
	expect(screen.getByText('Butter')).not.toHaveClass('line-through')
})

it('hides the servings scaler when the recipe has no servings', () => {
	render(<IngredientsCard ingredients={ingredients} servings={null} />)
	expect(screen.queryByRole('group', { name: 'Servings' })).not.toBeInTheDocument()
	expect(screen.queryByRole('button', { name: 'Increase servings' })).not.toBeInTheDocument()
})

it('rescales amounts, announces the new count and leaves "to taste" alone', async () => {
	const user = userEvent.setup()
	render(<IngredientsCard ingredients={ingredients} servings={2} />)
	const group = screen.getByRole('group', { name: 'Servings' })
	expect(within(group).getByRole('status')).toHaveTextContent('2')
	expect(within(group).getByRole('status')).toHaveAttribute('aria-live', 'polite')
	expect(screen.queryByText(/Scaled from/)).not.toBeInTheDocument()

	await user.click(increase())
	expect(within(group).getByRole('status')).toHaveTextContent('3')
	expect(amounts()).toEqual(['300 g', '1.5 tbsp', '6 clove', 'to taste'])
	expect(screen.getByText(/Scaled from 2 servings\./)).toBeInTheDocument()
})

it('restores the exact stored amounts with Reset and keeps focus inside the control', async () => {
	const user = userEvent.setup()
	render(<IngredientsCard ingredients={ingredients} servings={4} />)
	await user.click(decrease())
	await user.click(decrease())
	expect(amounts()).toEqual(['100 g', '0.5 tbsp', '2 clove', 'to taste'])
	await user.click(screen.getByRole('button', { name: 'Reset' }))
	expect(amounts()).toEqual(['200 g', '1 tbsp', '4 clove', 'to taste'])
	expect(screen.queryByText(/Scaled from/)).not.toBeInTheDocument()
	expect(screen.getByRole('group', { name: 'Servings' })).toContainElement(document.activeElement as HTMLElement)
})

it('clears the scaled note when stepping back to the original count', async () => {
	const user = userEvent.setup()
	render(<IngredientsCard ingredients={ingredients} servings={2} />)
	await user.click(increase())
	await user.click(decrease())
	expect(screen.queryByText(/Scaled from/)).not.toBeInTheDocument()
})

it('stops at 1 and 99 by disabling the buttons', async () => {
	const user = userEvent.setup()
	const { unmount } = render(<IngredientsCard ingredients={ingredients} servings={1} />)
	expect(decrease()).toBeDisabled()
	expect(increase()).toBeEnabled()
	unmount()

	render(<IngredientsCard ingredients={ingredients} servings={98} />)
	await user.click(increase())
	expect(screen.getByRole('status')).toHaveTextContent('99')
	expect(increase()).toBeDisabled()
	expect(screen.getByText(/Scaled from 98 servings\./)).toBeInTheDocument()
})

it('uses singular wording when scaled from one serving', async () => {
	const user = userEvent.setup()
	render(<IngredientsCard ingredients={ingredients} servings={1} />)
	await user.click(increase())
	expect(screen.getByText(/Scaled from 1 serving\./)).toBeInTheDocument()
})

it('keeps checked rows checked while scaling', async () => {
	const user = userEvent.setup()
	render(<IngredientsCard ingredients={ingredients} servings={2} />)
	await user.click(screen.getByRole('checkbox', { name: /Garlic/ }))
	await user.click(increase())
	expect(screen.getByRole('checkbox', { name: /Garlic/ })).toBeChecked()
})
