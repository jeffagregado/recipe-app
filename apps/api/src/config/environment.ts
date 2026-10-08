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

const environmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  AWS_ACCESS_KEY_ID: z.string().trim().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).refine((value) => value.trim().length > 0),
  AWS_ENDPOINT_URL_S3: z.url({ protocol: /^https?$/, hostname: /\S+/ }).pipe(z.string().refine((value) => {
    const url = new URL(value);
    return [url.username, url.password, url.search, url.hash].every((part) => !part);
  }, 'must be an HTTP(S) endpoint without credentials, query, or fragment')),
  AWS_REGION: z.string().trim().min(1),
  S3_BUCKET: z.string().trim().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
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
    throw new ConfigurationError(`Invalid API configuration: ${keys.join(', ')}. Check required values and URL formats; PORT must be an integer between 1 and 65535.`);
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
