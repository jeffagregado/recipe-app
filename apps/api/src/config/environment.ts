import { z } from 'zod';

const unsafeTlsOptions: readonly [string, readonly string[]][] = [
  ['sslmode', ['disable', 'no-verify']],
  ['ssl', ['false', '0']],
  ['uselibpqcompat', ['true']],
];

const databaseUrlSchema = z.url({ protocol: /^postgres(?:ql)?$/, hostname: /\S+/ })
  .pipe(z.string()
    .refine((value) => new URL(value).pathname.length > 1, 'must include a database name')
    .refine((value) => {
      const options = new URL(value).searchParams;
      return unsafeTlsOptions.every(([key, blocked]) =>
        options.getAll(key).every((option) => !blocked.includes(option)));
    }, 'must keep certificate verification enabled'));

/** Development fallback; production must configure its own list. */
const localAuthOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const originEntry = /^https?:\/\/[^\s/?#@*\\]+\/?$/i;

/**
 * Lenient on format (optional surrounding brackets, whitespace, trailing commas), strict on content:
 * each entry is an exact http(s) origin, normalized with `new URL().origin` and de-duplicated.
 */
const authTrustedOriginsSchema = z.string().optional().transform((value, context) => {
  const list = value?.trim() ?? '';
  const entries = (list.startsWith('[') && list.endsWith(']') ? list.slice(1, -1) : list)
    .split(',').map((entry) => entry.trim()).filter(Boolean);
  const origins = new Set<string>();
  for (const entry of entries) {
    // The pattern rejects paths, queries, fragments, credentials and wildcards before URL parsing normalizes the origin.
    if (!originEntry.test(entry) || !URL.canParse(entry)) {
      context.addIssue({ code: 'custom', message: 'must be exact http(s) origins without path, query, fragment, credentials or wildcard' });
      return z.NEVER;
    }
    origins.add(new URL(entry).origin);
  }
  return [...origins];
});

/** Resend's shared sender; it delivers only to the account owner until a verified domain replaces it. */
const defaultMailSender = 'Recipe App <onboarding@resend.dev>';
const mailAddress = String.raw`[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+`;
/** One address, bare or as `Name <address>`; the name holds no separator, quote, `@` or control character, so it cannot add a recipient or a header. */
const mailSender = new RegExp(String.raw`^(?:${mailAddress}|[^<>,;"@\p{Cc}]+ <${mailAddress}>)$`, 'u');
/** An env example line left empty means "not set". */
const blankAsUnset = (value: unknown) => (typeof value === 'string' && !value.trim() ? undefined : value);

type SmtpSettings = { SMTP_HOST?: string; SMTP_PORT?: number; SMTP_USER?: string; SMTP_PASSWORD?: string };
const smtpKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] as const;

const isCompleteSmtp = (settings: SmtpSettings): settings is Required<SmtpSettings> => smtpKeys.every((key) => settings[key] !== undefined);

/** Gmail replaces any From address other than the signed-in account's own, so the configured sender would never show. */
function isGmailSenderMismatch({ SMTP_HOST, SMTP_USER }: Required<SmtpSettings>, mailFrom: string): boolean {
  const sender = /<([^<>]+)>$/.exec(mailFrom)?.[1] ?? mailFrom;
  return SMTP_HOST.toLowerCase() === 'smtp.gmail.com' && sender.toLowerCase() !== SMTP_USER.toLowerCase();
}

/** The SMTP server and its login, set all together or not at all. */
function smtpSettings(settings: SmtpSettings, mailFrom: string): { smtp?: { host: string; port: number; user: string; password: string }; missing: [string, string][] } {
  if (!isCompleteSmtp(settings)) {
    const unset = smtpKeys.filter((key) => settings[key] === undefined);
    return { missing: unset.length < smtpKeys.length ? unset.map((key) => [key, 'is required with the other SMTP settings']) : [] };
  }
  if (isGmailSenderMismatch(settings, mailFrom)) return { missing: [['MAIL_FROM', 'must be the SMTP_USER address with Gmail']] };
  return { smtp: { host: settings.SMTP_HOST, port: settings.SMTP_PORT, user: settings.SMTP_USER, password: settings.SMTP_PASSWORD }, missing: [] };
}

/** The path of the web route handler that receives Google's redirect; the origin in front of it is the web app's. */
const GOOGLE_CALLBACK_PATH = '/api/auth/callback/google';
const localGoogleRedirectUri = `http://localhost:3000${GOOGLE_CALLBACK_PATH}`;
const googleRedirectUriSchema = z.url({ protocol: /^https?$/, hostname: /\S+/ }).pipe(z.string().refine((value) => {
  const url = new URL(value);
  return url.pathname === GOOGLE_CALLBACK_PATH && [url.username, url.password, url.search, url.hash].every((part) => !part);
}, 'must be the web origin followed by the Google callback path'));

type GoogleSettings = { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string; GOOGLE_REDIRECT_URI?: string };

/** The keys a half-configured Google client is missing, each with the reason. */
function missingGoogleSettings(google: GoogleSettings, production: boolean): [key: keyof GoogleSettings, message: string][] {
  const missing: [keyof GoogleSettings, string][] = [];
  if (google.GOOGLE_CLIENT_ID && !google.GOOGLE_CLIENT_SECRET) missing.push(['GOOGLE_CLIENT_SECRET', 'is required with GOOGLE_CLIENT_ID']);
  if (google.GOOGLE_CLIENT_SECRET && !google.GOOGLE_CLIENT_ID) missing.push(['GOOGLE_CLIENT_ID', 'is required with GOOGLE_CLIENT_SECRET']);
  // The local callback is a development default only: a deployment that offers Google names its own web origin.
  if (production && google.GOOGLE_CLIENT_ID && !google.GOOGLE_REDIRECT_URI) missing.push(['GOOGLE_REDIRECT_URI', 'is required in production']);
  return missing;
}

const environmentSchema = z.object({
  NODE_ENV: z.string().optional(),
  AUTH_TRUSTED_ORIGINS: authTrustedOriginsSchema,
  BETTER_AUTH_SECRET: z.string().min(32).refine((value) => value.trim().length >= 32),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/, hostname: /\S+/ }).pipe(z.string().refine((value) => {
    const url = new URL(value);
    return [url.username, url.password, url.search, url.hash].every((part) => !part);
  }, 'must be an HTTP(S) URL without credentials, query, or fragment')),
  DATABASE_URL: databaseUrlSchema,
  AWS_ACCESS_KEY_ID: z.string().trim().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).refine((value) => value.trim().length > 0),
  AWS_ENDPOINT_URL_S3: z.url({ protocol: /^https?$/, hostname: /\S+/ }).pipe(z.string().refine((value) => {
    const url = new URL(value);
    return [url.username, url.password, url.search, url.hash].every((part) => !part);
  }, 'must be an HTTP(S) endpoint without credentials, query, or fragment')),
  AWS_REGION: z.string().trim().min(1),
  S3_BUCKET: z.string().trim().min(1),
  RESEND_API_KEY: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  MAIL_FROM: z.preprocess(blankAsUnset, z.string().trim().regex(mailSender).default(defaultMailSender)),
  /** An SMTP server takes precedence over Resend; see createMailTransport. */
  SMTP_HOST: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  SMTP_PORT: z.preprocess(blankAsUnset, z.coerce.number().int().min(1).max(65535).optional()),
  SMTP_USER: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  SMTP_PASSWORD: z.preprocess(blankAsUnset, z.string().trim().optional()),
  GOOGLE_CLIENT_ID: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  GOOGLE_REDIRECT_URI: z.preprocess(blankAsUnset, z.string().trim().pipe(googleRedirectUriSchema).optional()),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Proxies in front of the API whose X-Forwarded-For entries are trusted; 0 trusts loopback only. See mountAuth. */
  TRUST_PROXY_HOPS: z.preprocess(blankAsUnset, z.coerce.number().int().min(0).default(0)),
}).transform(({ NODE_ENV, AUTH_TRUSTED_ORIGINS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, ...config }, context) => {
  const production = NODE_ENV === 'production';
  const { smtp, missing: smtpMissing } = smtpSettings({ SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD }, config.MAIL_FROM);
  const missing: [string, string][] = [...missingGoogleSettings(config, production), ...smtpMissing];
  if (production && AUTH_TRUSTED_ORIGINS.length === 0) missing.push(['AUTH_TRUSTED_ORIGINS', 'is required in production']);
  for (const [key, message] of missing) context.issues.push({ code: 'custom', message, input: undefined, path: [key] });
  if (missing.length > 0) return z.NEVER;
  return {
    ...config,
    ...(smtp && { SMTP: smtp }),
    GOOGLE_REDIRECT_URI: config.GOOGLE_REDIRECT_URI ?? (production ? undefined : localGoogleRedirectUri),
    AUTH_TRUSTED_ORIGINS: AUTH_TRUSTED_ORIGINS.length > 0 ? AUTH_TRUSTED_ORIGINS : localAuthOrigins,
  };
});

export type Environment = z.infer<typeof environmentSchema>;

class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
}

/** Report key names and constraints only; Zod issues can contain secret values. */
export function validateEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
    throw new ConfigurationError(`Invalid API configuration: ${keys.join(', ')}. Check required values and URL formats; PORT must be an integer between 1 and 65535; TRUST_PROXY_HOPS must be an integer of 0 or more; AUTH_TRUSTED_ORIGINS must list exact http(s) origins and is required in production; MAIL_FROM must be one address, bare or as Name <address>; RESEND_API_KEY must not contain whitespace; SMTP_HOST, SMTP_PORT (an integer between 1 and 65535), SMTP_USER and SMTP_PASSWORD are set together, and with Gmail MAIL_FROM is the SMTP_USER address; GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set together, and GOOGLE_REDIRECT_URI is the web origin followed by ${GOOGLE_CALLBACK_PATH}, required in production when Google is configured.`);
  }
  return result.data;
}

export function validateDatabaseUrl(input: unknown): string {
  const result = databaseUrlSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigurationError('Invalid DATABASE_URL: set a PostgreSQL URL with a database name and certificate verification enabled.');
  }
  return result.data;
}
