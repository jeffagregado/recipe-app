import { Injectable } from '@nestjs/common';
import { recipeSummarySchema } from '@recipe-app/contracts/schemas';
import type { RecipeSummary } from '@recipe-app/contracts/types';
import { sampleRecipes } from './sample-recipes.js';

@Injectable()
export class RecipesService {
  findAll(): RecipeSummary[] {
    return recipeSummarySchema.array().parse(sampleRecipes);
  }
}
