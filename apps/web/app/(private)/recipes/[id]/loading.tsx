import PageContainer from '@/components/layout/page-container'
import { RecipeDetailLoading } from './_components/recipe-detail-loading'

export default function LoadingRecipe() {
	return (
		<PageContainer size="default">
			<RecipeDetailLoading />
		</PageContainer>
	)
}
