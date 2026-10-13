import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { createMailTransport, MAIL_TRANSPORT } from './mail.transport.js';

@Module({
  imports: [ConfigModule],
  providers: [{
    provide: MAIL_TRANSPORT,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Environment, true>) => createMailTransport({
      RESEND_API_KEY: config.get('RESEND_API_KEY', { infer: true }),
      MAIL_FROM: config.get('MAIL_FROM', { infer: true }),
    }),
  }],
  exports: [MAIL_TRANSPORT],
})
export class MailModule {}
