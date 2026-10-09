import type { ServerResponse } from 'node:http';
import { Controller, Header, Post, Req, Res, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { CreateRecipeResult } from '@recipe-app/contracts/types';
import { SessionGuard } from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { RecipeCreateService } from './recipe-create.service.js';
import { RecipeFilter } from './recipe-errors.js';
import { RecipeUploadInterceptor, RecipeWriteGuard } from './recipe-upload.js';
import type { RecipeUploadRequest } from './recipe-upload.js';

@Controller('recipes')
@UseGuards(SessionGuard, OriginGuard, RecipeWriteGuard)
@UseFilters(RecipeFilter)
export class RecipeCreateController {
  constructor(private readonly createService: RecipeCreateService) {}

  @Post()
  @UseInterceptors(RecipeUploadInterceptor)
  @Header('Cache-Control', 'private, no-store')
  async create(@Req() request: RecipeUploadRequest, @Res({ passthrough: true }) response: ServerResponse): Promise<CreateRecipeResult> {
    const result = await this.createService.create(request);
    response.statusCode = result.replay ? 200 : 201;
    return { id: result.id };
  }
}
