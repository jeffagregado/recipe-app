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

/** The OAuth client and refresh token the mail transport sends through the Gmail API with. */
export type GmailAccount = { clientId: string; clientSecret: string; refreshToken: string };

type GmailEnv = { GMAIL_CLIENT_ID?: string; GMAIL_CLIENT_SECRET?: string; GMAIL_REFRESH_TOKEN?: string };
const gmailKeys = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'] as const;
const gmailSender = /@(?:gmail|googlemail)\.com>?$/i;

const isCompleteGmail = (env: GmailEnv): env is Required<GmailEnv> => gmailKeys.every((key) => env[key] !== undefined);

/** The Gmail account when all three settings are set, or the issues with them: a partial set, or a sender Gmail would replace. */
function parseGmailAccount(env: GmailEnv, mailFrom: string): { account?: GmailAccount; issues: [string, string][] } {
  if (!isCompleteGmail(env)) {
    const unset = gmailKeys.filter((key) => env[key] === undefined);
    return { issues: unset.length < gmailKeys.length ? unset.map((key) => [key, 'is required with the other Gmail settings']) : [] };
  }
  // Gmail replaces any From address other than the authorised account's own, so the sender must be a Gmail address.
  if (!gmailSender.test(mailFrom)) return { issues: [['MAIL_FROM', 'must be the authorised Gmail address']] };
  return { account: { clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken: env.GMAIL_REFRESH_TOKEN }, issues: [] };
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
  /** A Gmail account takes precedence over Resend; see createMailTransport. */
  GMAIL_CLIENT_ID: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  GMAIL_CLIENT_SECRET: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  GMAIL_REFRESH_TOKEN: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  GOOGLE_CLIENT_ID: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(blankAsUnset, z.string().trim().regex(/^\S+$/).optional()),
  GOOGLE_REDIRECT_URI: z.preprocess(blankAsUnset, z.string().trim().pipe(googleRedirectUriSchema).optional()),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  /** Proxies in front of the API whose X-Forwarded-For entries are trusted; 0 trusts loopback only. See mountAuth. */
  TRUST_PROXY_HOPS: z.preprocess(blankAsUnset, z.coerce.number().int().min(0).default(0)),
}).transform(({ NODE_ENV, AUTH_TRUSTED_ORIGINS, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, ...config }, context) => {
  const production = NODE_ENV === 'production';
  const gmail = parseGmailAccount({ GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN }, config.MAIL_FROM);
  const missing: [string, string][] = [...missingGoogleSettings(config, production), ...gmail.issues];
  if (production && AUTH_TRUSTED_ORIGINS.length === 0) missing.push(['AUTH_TRUSTED_ORIGINS', 'is required in production']);
  for (const [key, message] of missing) context.issues.push({ code: 'custom', message, input: undefined, path: [key] });
  if (missing.length > 0) return z.NEVER;
  return {
    ...config,
    ...(gmail.account && { GMAIL: gmail.account }),
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
    throw new ConfigurationError(`Invalid API configuration: ${keys.join(', ')}. Check required values and URL formats; PORT must be an integer between 1 and 65535; TRUST_PROXY_HOPS must be an integer of 0 or more; AUTH_TRUSTED_ORIGINS must list exact http(s) origins and is required in production; MAIL_FROM must be one address, bare or as Name <address>; RESEND_API_KEY must not contain whitespace; GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN are set together, and with them MAIL_FROM is the authorised Gmail address; GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set together, and GOOGLE_REDIRECT_URI is the web origin followed by ${GOOGLE_CALLBACK_PATH}, required in production when Google is configured.`);
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
