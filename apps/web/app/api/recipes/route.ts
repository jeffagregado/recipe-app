import { recipeSummarySchema } from '@recipe-app/contracts/schemas'

import { sampleRecipes } from '@/app/(private)/recipes/sample-recipes'

// Temporary endpoint; replace with NestJS when the backend is ready.
export function GET() {
	return Response.json(recipeSummarySchema.array().parse(sampleRecipes))
}
