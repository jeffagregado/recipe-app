import { BadRequestException, Controller, Get, Header, Query } from '@nestjs/common';
import { recipeListQuerySchema } from '@recipe-app/contracts/schemas';
import type { RecipeListResponse } from '@recipe-app/contracts/types';
import { RecipesService } from './recipes.service.js';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  findAll(@Query() query: Record<string, unknown>): Promise<RecipeListResponse> {
    const result = recipeListQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Invalid recipe query. Use search up to 200 characters, page >= 1, limit 1-20, a supported category/sortBy, and order asc or desc.',
        errors: result.error.issues.map(({ path, message }) => ({ parameter: path.join('.'), message })),
      });
    }
    return this.recipesService.findAll(result.data);
  }
}
