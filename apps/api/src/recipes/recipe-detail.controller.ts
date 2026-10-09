import { Controller, Get, Header, Param, Req, UseFilters, UseGuards } from '@nestjs/common';
import type { RecipeDetail } from '@recipe-app/contracts/types';
import { SessionGuard } from '../auth/session.guard.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { unauthenticated } from '../auth/auth.errors.js';
import { RecipeDetailService } from './recipe-detail.service.js';
import { RecipeFilter } from './recipe-errors.js';

@Controller('recipes')
@UseGuards(SessionGuard)
@UseFilters(RecipeFilter)
export class RecipeDetailController {
  constructor(private readonly detailService: RecipeDetailService) {}

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  findOne(@Param('id') id: string, @Req() request: AuthRequest): Promise<RecipeDetail> {
    if (!request.user) throw unauthenticated();
    return this.detailService.findOne(id, request.user.id);
  }
}
