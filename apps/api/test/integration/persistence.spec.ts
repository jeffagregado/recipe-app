import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { asc, eq } from 'drizzle-orm';
import { recipeSchema } from '@recipe-app/contracts/schemas';
import * as schema from '../../src/database/schema.js';
import { DEMO_AUTHOR_ID, seedDatabase } from '../../src/database/seed.js';
import { sampleRecipes } from '../../src/recipes/sample-recipes.js';
import { getDevDatabaseUrl } from '../neon-dev.js';

describe('Neon relational persistence', () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: await getDevDatabaseUrl(), ssl: { rejectUnauthorized: true }, max: 2 });
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it('repeats seed without duplicates and preserves complete public samples', async () => {
    const db = drizzle(pool, { schema });
    await seedDatabase(db);
    await seedDatabase(db);
    const rows = await db.query.recipes.findMany({
      where: eq(schema.recipes.userId, DEMO_AUTHOR_ID), orderBy: asc(schema.recipes.sortOrder),
      with: { ingredients: { orderBy: (t, { asc }) => asc(t.sortOrder), with: { ingredient: true } }, instructions: { orderBy: (t, { asc }) => asc(t.stepNumber) }, categories: { orderBy: (t, { asc }) => asc(t.sortOrder), with: { category: true } } },
    });
    expect(rows.map(({ id }) => id)).toEqual(sampleRecipes.map(({ id }) => id));
    for (const [index, row] of rows.entries()) {
      const recipe = recipeSchema.parse({ ...row,
        categories: row.categories.map(({ category }) => category.name), imageUrl: null,
        ingredients: row.ingredients.map((ingredient) => ({ ...ingredient, quantity: ingredient.quantity === null ? null : Number(ingredient.quantity) })),
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      });
      const expected = sampleRecipes[index];
      expect({ id: recipe.id, title: recipe.title, categories: recipe.categories, description: recipe.description, imageUrl: recipe.imageUrl, servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes,
        createdAt: new Date(recipe.createdAt).getTime(), updatedAt: new Date(recipe.updatedAt).getTime(),
      }).toEqual({ ...expected, createdAt: new Date(expected.createdAt).getTime(), updatedAt: new Date(expected.updatedAt).getTime() });
      expect(recipe.ingredients.length).toBeGreaterThan(0);
      expect(recipe.instructions.length).toBeGreaterThan(0);
      expect(recipe.ingredients.every((item) => item.ingredientId.length > 0)).toBe(true);
      expect(recipe.instructions.map(({ stepNumber }) => stepNumber)).toEqual(recipe.instructions.map((_, i) => i + 1));
    }
    const author = await db.query.users.findFirst({ where: eq(schema.users.id, DEMO_AUTHOR_ID), with: { accounts: true } });
    expect(author?.accounts.length).toBe(0);
    expect((await db.select().from(schema.categories)).length).toBe(5);
  }, 60_000);

  it('enforces relationships, ordering, bounds, uniqueness, three categories and deletion rules', async () => {
    const client = await pool.connect();
    const tag = `verify-${randomUUID()}`;
    const user = `${tag}-user`, recipe = `${tag}-recipe`, ingredient = `${tag}-ingredient`;
    const query = (text: string, values: unknown[] = []) => client.query(text, values);
    async function rejects(text: string, values: unknown[], code: string) {
      await query('SAVEPOINT invalid_write');
      let actual = 'succeeded';
      try { await query(text, values); } catch (error) {
        actual = error instanceof pg.DatabaseError ? error.code ?? 'missing-code' : 'unexpected-error';
      } finally { await query('ROLLBACK TO SAVEPOINT invalid_write'); }
      expect(actual).toBe(code);
    }
    await query('BEGIN');
    try {
      await query('INSERT INTO users(id, name, email) VALUES($1,$2,$3)', [user, 'Temporary verification', `${tag}@example.invalid`]);
      await query('INSERT INTO recipes(id,user_id,title) VALUES($1,$2,$3)', [recipe, user, 'Temporary recipe']);
      await query('INSERT INTO ingredients(id,name) VALUES($1,$2)', [ingredient, `${tag} ingredient`]);
      await query('INSERT INTO recipe_ingredients(recipe_id,ingredient_id,name,quantity,unit,sort_order) VALUES($1,$2,$3,1,\'g\',0)', [recipe, ingredient, 'Ingredient']);
      await query('INSERT INTO recipe_instructions(recipe_id,step_number,description) VALUES($1,1,$2)', [recipe, 'Cook it']);
      await query('INSERT INTO favorites(user_id,recipe_id) VALUES($1,$2)', [user, recipe]);
      await query('INSERT INTO recipe_images(recipe_id,object_key,sort_order) VALUES($1,$2,0)', [recipe, tag]);
      const { rows: categories } = await query('SELECT id FROM categories ORDER BY name');
      for (let index = 0; index < 3; index++) {
        await query('INSERT INTO recipe_categories(recipe_id,category_id,sort_order) VALUES($1,$2,$3)', [recipe, categories[index].id, index]);
      }
      await query('INSERT INTO auth_accounts(user_id,account_id,provider_id) VALUES($1,$1,\'credential\')', [user]);
      await query('INSERT INTO auth_sessions(user_id,token,expires_at) VALUES($1,$2,now()+interval \'1 hour\')', [user, tag]);
      await rejects('INSERT INTO recipes(user_id,title) VALUES($1,\'Orphan\')', [`${tag}-missing`], '23503');
      await rejects('INSERT INTO recipe_ingredients(recipe_id,ingredient_id,name,sort_order) VALUES($1,$2,\'Orphan\',1)', [recipe, `${tag}-missing`], '23503');
      await rejects('INSERT INTO favorites(user_id,recipe_id) VALUES($1,$2)', [user, recipe], '23505');
      await rejects('INSERT INTO recipe_categories(recipe_id,category_id,sort_order) VALUES($1,$2,0)', [recipe, categories[0].id], '23505');
      await rejects('INSERT INTO recipe_categories(recipe_id,category_id,sort_order) VALUES($1,$2,0)', [recipe, categories[3].id], '23505');
      await rejects('INSERT INTO recipe_categories(recipe_id,category_id,sort_order) VALUES($1,$2,3)', [recipe, categories[3].id], '23514');
      await rejects('INSERT INTO recipe_ingredients(recipe_id,ingredient_id,name,sort_order) VALUES($1,$2,\'Repeat\',0)', [recipe, ingredient], '23505');
      await rejects('INSERT INTO recipe_instructions(recipe_id,step_number,description) VALUES($1,1,\'Repeat\')', [recipe], '23505');
      await rejects('UPDATE recipe_ingredients SET quantity = 0 WHERE recipe_id=$1', [recipe], '23514');
      await rejects('UPDATE recipe_ingredients SET quantity = -1 WHERE recipe_id=$1', [recipe], '23514');
      await rejects('UPDATE recipe_ingredients SET unit = \'unknown\' WHERE recipe_id=$1', [recipe], '23514');
      await rejects('UPDATE recipes SET servings=0 WHERE id=$1', [recipe], '23514');
      await rejects('UPDATE recipes SET prep_time_minutes=-1 WHERE id=$1', [recipe], '23514');
      await rejects('UPDATE recipes SET cook_time_minutes=-1 WHERE id=$1', [recipe], '23514');
      await rejects('UPDATE recipe_instructions SET description=\' \', step_number=0 WHERE recipe_id=$1', [recipe], '23514');
      await rejects('INSERT INTO ingredients(name) VALUES($1)', [`${tag.toUpperCase()} INGREDIENT`], '23505');
      await rejects('INSERT INTO auth_accounts(user_id,account_id,provider_id) VALUES($1,$1,\'credential\')', [user], '23505');
      await rejects('DELETE FROM ingredients WHERE id=$1', [ingredient], '23001');
      await rejects('DELETE FROM categories WHERE id=$1', [categories[0].id], '23001');
      await rejects('UPDATE recipe_ingredients SET quantity = \'NaN\' WHERE recipe_id=$1', [recipe], '23514');
      const joined = await query('SELECT i.id FROM recipe_ingredients ri JOIN ingredients i ON i.id=ri.ingredient_id JOIN recipes r ON r.id=ri.recipe_id JOIN users u ON u.id=r.user_id WHERE r.id=$1', [recipe]);
      expect(joined.rowCount).toBe(1);
      await query('DELETE FROM users WHERE id=$1', [user]);
      for (const table of ['recipes', 'auth_accounts', 'auth_sessions', 'favorites']) {
        expect((await query(`SELECT count(*)::int AS count FROM ${table} WHERE user_id=$1`, [user])).rows[0].count).toBe(0);
      }
      for (const table of ['recipe_ingredients', 'recipe_instructions', 'recipe_categories', 'recipe_images']) {
        expect((await query(`SELECT count(*)::int AS count FROM ${table} WHERE recipe_id=$1`, [recipe])).rows[0].count).toBe(0);
      }
      expect((await query('SELECT count(*)::int AS count FROM ingredients WHERE id=$1', [ingredient])).rows[0].count).toBe(1);
    } finally {
      await query('ROLLBACK');
      client.release();
    }
  }, 60_000);
});
