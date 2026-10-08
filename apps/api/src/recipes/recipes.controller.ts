import { Controller, Get, Header } from '@nestjs/common';
import type { RecipeSummary } from '@recipe-app/contracts/types';
import { RecipesService } from './recipes.service.js';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  findAll(): Promise<RecipeSummary[]> {
    return this.recipesService.findAll();
  }
}
