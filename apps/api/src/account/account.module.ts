import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AccountController, EmailChangeLinkController } from './account.controller.js';
import { AccountService } from './account.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, MailModule],
  controllers: [AccountController, EmailChangeLinkController],
  providers: [AccountService],
})
export class AccountModule {}
