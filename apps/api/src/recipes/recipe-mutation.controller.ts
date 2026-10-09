import { Controller, Delete, Header, HttpCode, Param, Patch, Put, Req, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { CreateRecipeResult } from '@recipe-app/contracts/types';
import type { AuthRequest } from '../auth/auth.request.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { RecipeDeleteService } from './recipe-delete.service.js';
import { RecipeFilter } from './recipe-errors.js';
import { RecipeFavoriteService } from './recipe-favorite.service.js';
import { RecipeDeleteGuard, RecipeFavoriteGuard, RecipeOwnerGuard } from './recipe-guards.js';
import { RecipeUpdateService } from './recipe-update.service.js';
import { RecipeUploadInterceptor, RecipeWriteGuard } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';

@Controller('recipes/:id')
@UseGuards(SessionGuard, OriginGuard)
@UseFilters(RecipeFilter)
export class RecipeMutationController {
  constructor(private readonly updateService: RecipeUpdateService, private readonly deleteService: RecipeDeleteService,
    private readonly favoriteService: RecipeFavoriteService) {}

  @Patch()
  @UseGuards(RecipeOwnerGuard, RecipeWriteGuard)
  @UseInterceptors(RecipeUploadInterceptor)
  @Header('Cache-Control', 'private, no-store')
  async update(@Param('id') id: string, @Req() request: RecipeUploadRequest): Promise<CreateRecipeResult> {
    return { id: (await this.updateService.update(id, request)).id };
  }

  @Delete()
  @UseGuards(RecipeDeleteGuard)
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  remove(@Param('id') id: string, @Req() request: AuthRequest): Promise<void> {
    return this.deleteService.remove(id, request.user!.id);
  }

  @Put('favorite')
  @UseGuards(RecipeFavoriteGuard)
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  addFavorite(@Param('id') id: string, @Req() request: AuthRequest): Promise<void> {
    return this.favoriteService.set(id, request.user!.id, true);
  }

  @Delete('favorite')
  @UseGuards(RecipeFavoriteGuard)
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  removeFavorite(@Param('id') id: string, @Req() request: AuthRequest): Promise<void> {
    return this.favoriteService.set(id, request.user!.id, false);
  }
}
