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
import { RecipeAttempts } from './recipe-attempts.js';
import { RecipeDeleteService } from './recipe-delete.service.js';
import { RecipeFavoriteService } from './recipe-favorite.service.js';
import { RecipeDeleteGuard, RecipeFavoriteGuard, RecipeOwnerGuard } from './recipe-guards.js';
import { RecipeMutationController } from './recipe-mutation.controller.js';
import { RecipeUpdateService } from './recipe-update.service.js';
import { PendingPhotoController } from './pending-photo.controller.js';
import { PendingPhotoService, PendingPhotoUploadGuard, PendingPhotoUploadInterceptor } from './pending-photos.js';

@Module({
  imports: [DatabaseModule, StorageModule, AuthModule],
  controllers: [RecipesController, RecipeCreateController, RecipeDetailController, RecipeMutationController, PendingPhotoController],
  providers: [RecipesService, RecipesResilienceLogger, RecipeCreateService, RecipeDetailService,
    RecipeUploadInterceptor, RecipeUploadSlots, RecipeWriteGuard, RecipeWriteHook,
    RecipeAttempts, RecipeUpdateService, RecipeDeleteService, RecipeFavoriteService,
    RecipeOwnerGuard, RecipeDeleteGuard, RecipeFavoriteGuard, PendingPhotoService, PendingPhotoUploadGuard, PendingPhotoUploadInterceptor],
})
export class RecipesModule {}
