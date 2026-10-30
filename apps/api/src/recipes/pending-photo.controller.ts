import { Controller, Header, Post, Req, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { PendingPhoto } from '@recipe-app/contracts/types';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { PendingPhotoService, PendingPhotoUploadGuard, PendingPhotoUploadInterceptor } from './pending-photos.js';
import { RecipeFilter } from './recipe-errors.js';
import type { RecipeUploadRequest } from './recipe-upload.js';

@Controller('pending-photos')
@UseGuards(SessionGuard, OriginGuard, PendingPhotoUploadGuard)
@UseFilters(RecipeFilter)
export class PendingPhotoController {
  constructor(private readonly photos: PendingPhotoService) {}

  @Post()
  @UseInterceptors(PendingPhotoUploadInterceptor)
  @Header('Cache-Control', 'private, no-store')
  upload(@Req() request: RecipeUploadRequest): Promise<PendingPhoto> {
    return this.photos.upload(request.user!.id, request.files ?? [], request.writeDeadline!);
  }
}
