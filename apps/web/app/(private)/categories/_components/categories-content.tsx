import { CategoriesForm } from '@/features/categories/components/categories-form'
import { getCategories } from '@/features/categories/queries/get-categories'

/** Uncached owner-scoped read inside the page's Suspense boundary; anonymous visitors are redirected before anything renders. */
export async function CategoriesContent() {
	const categories = await getCategories()
	// A save (here or on another page) changes the stored list, so the form remounts with it instead of keeping edited state.
	return <CategoriesForm key={JSON.stringify(categories)} categories={categories} />
}
