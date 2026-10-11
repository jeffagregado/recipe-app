import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { CategoryWriteGuard } from './category-write.guard.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryWriteGuard],
})
export class CategoriesModule {}
