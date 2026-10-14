import type { Type } from '@nestjs/common';
import type { NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';
import { MAIL_TRANSPORT } from '../src/mail/mail.transport.js';
import type { MailMessage, MailTransport } from '../src/mail/mail.transport.js';

/** Keeps every message in send order and delivers none. */
export class RecordingMailTransport implements MailTransport {
  readonly messages: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  /** The messages mailed to one address, in send order. */
  sentTo(to: string): Promise<MailMessage[]> {
    return Promise.resolve(this.messages.filter((message) => message.to === to));
  }
}

/** Replaces further providers before the application is compiled, such as the endpoints a provider stand-in answers. */
export type ConfigureTestingModule = (builder: TestingModuleBuilder) => TestingModuleBuilder;

/** Builds the application with its mail transport replaced, so a suite never reaches Resend even when the env file holds a key. */
export async function createAppWithRecordedMail(module: Type<unknown>, options: NestApplicationOptions, configure: ConfigureTestingModule = (builder) => builder): Promise<{ app: NestExpressApplication; mail: RecordingMailTransport }> {
  const mail = new RecordingMailTransport();
  const compiled = await configure(Test.createTestingModule({ imports: [module] }).overrideProvider(MAIL_TRANSPORT).useValue(mail)).compile();
  return { app: compiled.createNestApplication<NestExpressApplication>(options), mail };
}
