import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller.js';
import { RecipesService } from './recipes.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { RecipesResilienceLogger } from './recipes-resilience.logger.js';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [RecipesController],
  providers: [RecipesService, RecipesResilienceLogger],
})
export class RecipesModule {}
