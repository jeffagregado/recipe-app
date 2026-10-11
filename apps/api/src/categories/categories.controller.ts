import { Body, Controller, Get, Header, Put, Req, UseFilters, UseGuards } from '@nestjs/common';
import { saveCategoriesSchema } from '@recipe-app/contracts/schemas';
import type { CategoryWithUsage } from '@recipe-app/contracts/types';
import { unauthenticated } from '../auth/auth.errors.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { RecipeError, RecipeFilter } from '../recipes/recipe-errors.js';
import { CategoriesService } from './categories.service.js';
import { CategoryWriteGuard } from './category-write.guard.js';

@Controller('categories')
@UseGuards(SessionGuard)
@UseFilters(RecipeFilter)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  findAll(@Req() request: AuthRequest): Promise<CategoryWithUsage[]> {
    if (!request.user) throw unauthenticated();
    return this.categories.list(request.user.id);
  }

  /** Replaces the owner's whole set; the body is the list they keep. */
  @Put()
  @UseGuards(OriginGuard, CategoryWriteGuard)
  @Header('Cache-Control', 'private, no-store')
  replace(@Body() body: unknown, @Req() request: AuthRequest): Promise<CategoryWithUsage[]> {
    if (!request.user) throw unauthenticated();
    const result = saveCategoriesSchema.safeParse(body);
    if (!result.success) {
      // Prototype-free: row paths such as `2.name` are plain entries.
      const fieldErrors: Record<string, string[]> = Object.create(null);
      for (const issue of result.error.issues.slice(0, 32)) {
        const field = issue.path.join('.') || 'categories';
        (fieldErrors[field] ??= []).push(issue.code === 'unrecognized_keys' ? 'Unexpected field.' : issue.message);
      }
      throw new RecipeError(400, 'VALIDATION_FAILED', 'Check category fields.', { fieldErrors });
    }
    return this.categories.replace(request.user.id, result.data);
  }
}
