import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RecipesModule } from './recipes/recipes.module.js';

@Module({
  imports: [RecipesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
