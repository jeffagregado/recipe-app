import { config } from 'dotenv';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createAuth } from './src/auth/auth.js';
import { validateEnvironment } from './src/config/environment.js';
import * as schema from './src/database/schema.js';

// CLI generates schema only. It never probes or migrates the database.
config({ quiet: true });
const environment = validateEnvironment(process.env);
const pool = new pg.Pool({ connectionString: environment.DATABASE_URL, ssl: { rejectUnauthorized: true } });
export const auth = createAuth(drizzle(pool, { schema }), environment);
