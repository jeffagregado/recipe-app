import { createServer } from 'node:http';
import { getDevDatabaseUrl } from './neon-dev.ts';

// Resolve and verify the approved target before starting the compiled API.
try {
  process.env.DATABASE_URL = await getDevDatabaseUrl();
  process.env.NODE_ENV = 'development';
  // The Playwright web server runs at this origin; process environment overrides the env file.
  process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:4100';
  process.env.PORT ||= '4101';
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../dist/app.module.js');
  const { mountAuth } = await import('../dist/auth/auth.http.js');
  const { MAIL_TRANSPORT } = await import('../dist/mail/mail.transport.js');

  // E2E signs up Accounts through this server, so its mail is recorded and never reaches Resend. The database holds only
  // a hash of each link's token, so the tests read the links here, from loopback only.
  const messages = [];
  const mail = { send: (message) => { messages.push(message); return Promise.resolve(); } };
  createServer((request, response) => {
    const to = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams.get('to');
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(messages.filter((message) => message.to === to)));
  }).listen(Number(process.env.MAIL_READER_PORT), '127.0.0.1');

  const compiled = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MAIL_TRANSPORT).useValue(mail).compile();
  const app = compiled.createNestApplication({ abortOnError: false, bodyParser: false });
  mountAuth(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Dev verification server failed.');
  process.exitCode = 1;
}
