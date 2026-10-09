import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller.js';
import { RecipesService } from './recipes.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { RecipesResilienceLogger } from './recipes-resilience.logger.js';
import { AuthModule } from '../auth/auth.module.js';
import { RecipeCreateService } from './recipe-create.service.js';
import { RecipeDetailService } from './recipe-detail.service.js';
import { RecipeUploadInterceptor, RecipeUploadSlots, RecipeWriteGuard } from './recipe-upload.js';
import { RecipeWriteHook } from './recipe-write-hook.js';
import { RecipeCreateController } from './recipe-create.controller.js';
import { RecipeDetailController } from './recipe-detail.controller.js';

@Module({
  imports: [DatabaseModule, StorageModule, AuthModule],
  controllers: [RecipesController, RecipeCreateController, RecipeDetailController],
  providers: [RecipesService, RecipesResilienceLogger, RecipeCreateService, RecipeDetailService,
    RecipeUploadInterceptor, RecipeUploadSlots, RecipeWriteGuard, RecipeWriteHook],
})
export class RecipesModule {}
