import { BadRequestException, Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { recipeListQuerySchema } from '@recipe-app/contracts/schemas';
import type { RecipeListResponse } from '@recipe-app/contracts/types';
import { RecipesService } from './recipes.service.js';
import { SessionGuard } from '../auth/session.guard.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { unauthenticated } from '../auth/auth.errors.js';

@Controller('recipes')
@UseGuards(SessionGuard)
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  findAll(@Query() query: Record<string, unknown>, @Req() request: AuthRequest): Promise<RecipeListResponse> {
    const unknownKeys = Object.keys(query).filter((key) => !['search', 'page', 'limit', 'category', 'favorites', 'sortBy', 'order'].includes(key));
    if (unknownKeys.length) throw new BadRequestException({ message: 'Invalid recipe query. Unknown parameters.',
      errors: unknownKeys.map((parameter) => ({ parameter, message: 'Unexpected parameter.' })) });
    const result = recipeListQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Invalid recipe query. Use search up to 200 characters, page >= 1, limit 1-20, one of your category ids, a supported sortBy, favorites=true, and order asc or desc.',
        errors: result.error.issues.map(({ path, message }) => ({ parameter: path.join('.'), message })),
      });
    }
    if (!request.user) throw unauthenticated();
    return this.recipesService.findAll(result.data, request.user.id);
  }
}
