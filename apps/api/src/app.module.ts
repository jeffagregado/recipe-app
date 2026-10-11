import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ResilienceModule } from '@nestjs/resilience';
import { fileURLToPath } from 'node:url';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RecipesModule } from './recipes/recipes.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AuthModule } from './auth/auth.module.js';
import { recipeResiliencePresets } from './recipes/recipes.resilience.js';
import { authResiliencePresets } from './auth/auth.resilience.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: fileURLToPath(new URL('../.env', import.meta.url)),
      skipProcessEnv: true,
      validate: validateEnvironment,
    }),
    ResilienceModule.forRoot({ presets: { ...recipeResiliencePresets, ...authResiliencePresets } }),
    DatabaseModule,
    StorageModule,
    AuthModule,
    RecipesModule,
    CategoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
