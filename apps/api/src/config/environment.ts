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
/** One address, bare or as `Name <address>`; separators and line breaks would add recipients or headers. */
const mailSender = new RegExp(String.raw`^(?:${mailAddress}|[^<>,;\r\n]+ <${mailAddress}>)$`);
/** An env example line left empty means "not set". */
const blankAsUnset = (value: unknown) => (typeof value === 'string' && !value.trim() ? undefined : value);

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
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
}).transform(({ NODE_ENV, AUTH_TRUSTED_ORIGINS, ...config }, context) => {
  if (AUTH_TRUSTED_ORIGINS.length > 0) return { ...config, AUTH_TRUSTED_ORIGINS };
  if (NODE_ENV === 'production') {
    context.issues.push({ code: 'custom', message: 'is required in production', input: undefined, path: ['AUTH_TRUSTED_ORIGINS'] });
    return z.NEVER;
  }
  return { ...config, AUTH_TRUSTED_ORIGINS: localAuthOrigins };
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
    throw new ConfigurationError(`Invalid API configuration: ${keys.join(', ')}. Check required values and URL formats; PORT must be an integer between 1 and 65535; AUTH_TRUSTED_ORIGINS must list exact http(s) origins and is required in production; MAIL_FROM must be one address, bare or as Name <address>.`);
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
