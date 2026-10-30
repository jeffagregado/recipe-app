import { Controller, Delete, Header, HttpCode, Param, Post, Req, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { PendingPhoto } from '@recipe-app/contracts/types';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { PendingPhotoService, PendingPhotoUploadGuard, PendingPhotoUploadInterceptor } from './pending-photos.js';
import { RecipeFilter } from './recipe-errors.js';
import type { RecipeUploadRequest } from './recipe-upload.js';

@Controller('pending-photos')
@UseGuards(SessionGuard, OriginGuard)
@UseFilters(RecipeFilter)
export class PendingPhotoController {
  constructor(private readonly photos: PendingPhotoService) {}

  @Post()
  @UseGuards(PendingPhotoUploadGuard)
  @UseInterceptors(PendingPhotoUploadInterceptor)
  @Header('Cache-Control', 'private, no-store')
  upload(@Req() request: RecipeUploadRequest): Promise<PendingPhoto> {
    return this.photos.upload(request.user!.id, request.files ?? [], request.writeDeadline!);
  }

  /** Answers 204 whether or not the caller had such a Pending photo, so nothing is revealed about other Accounts' ids. */
  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'private, no-store')
  async delete(@Req() request: RecipeUploadRequest, @Param('id') id: string): Promise<void> {
    await this.photos.delete(request.user!.id, id);
  }
}
