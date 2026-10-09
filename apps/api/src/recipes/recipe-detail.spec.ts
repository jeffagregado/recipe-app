import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ResilienceService, ResilienceTimeoutError } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDb } from '../database/database.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { RecipeDetailService } from './recipe-detail.service.js';
import { RecipeFilter } from './recipe-errors.js';
import { parseRecipeMetadata } from './recipe-metadata.js';

describe('Recipe detail errors', () => {
  it.each(['bad\u0000id', 'x'.repeat(201)])('rejects invalid detail IDs without querying', async (id) => {
    const transaction = vi.fn();
    const db = { transaction } as unknown as DrizzleDb;
    const service = new RecipeDetailService(db, {} as StorageService, { preset: () => ({ execute: vi.fn() }) } as unknown as ResilienceService);
    await expect(Promise.resolve().then(() => service.findOne(id, 'owner'))).rejects.toMatchObject({ response: { code: 'NOT_FOUND' }, status: 404 });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('keeps an abort during image signing as a read timeout', async () => {
    const controller = new AbortController();
    const recipe = { images: [{ objectKey: 'disposable' }], instructions: [] };
    const database = { execute: async () => recipe };
    const read = { execute: async (operation: (context: { signal: AbortSignal }) => Promise<unknown>) => operation({ signal: controller.signal }) };
    const resilience = { preset: (name: string) => (name === 'recipeRead' ? read : database) as ResiliencePolicy };
    const storage = { signedDownloadUrl: async () => {
      controller.abort(new ResilienceTimeoutError(1, 'recipeRead'));
      return 'https://example.invalid/disposable';
    } };
    const service = new RecipeDetailService({} as DrizzleDb, storage as unknown as StorageService, resilience as ResilienceService);
    await expect(service.findOne('recipe', 'owner')).rejects.toBeInstanceOf(ResilienceTimeoutError);
  });
  it('labels unknown detail-route failures as detail', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const response = { setHeader: vi.fn(), end: vi.fn(), statusCode: 0 };
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'GET' }) }) } as unknown as ArgumentsHost;
    try {
      new RecipeFilter().catch(new Error('Disposable error'), host);
      expect(log.mock.calls.some(([message]) => typeof message === 'string' && message.startsWith('Recipe detail failed'))).toBe(true);
      expect(response.statusCode).toBe(503);
    } finally { log.mockRestore(); }
  });
});

describe('Recipe field error bounds', () => {
  it('bounds unknown metadata key length and count in public errors', () => {
    const metadata = { title: 'Soup', description: null, notes: null, videoUrl: null, categories: [], servings: null,
      prepTimeMinutes: null, cookTimeMinutes: null, ingredients: [{ name: 'Salt', quantity: null, unit: null }],
      instructions: [{ description: 'Mix', hasImage: false }],
      ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`${i}${'x'.repeat(5000)}`, true])) };
    try { parseRecipeMetadata({ recipe: JSON.stringify(metadata) }); expect.fail('Expected invalid metadata'); }
    catch (cause) {
      const error = cause as { getResponse: () => { fieldErrors: Record<string, string[]> } };
      const fields = Object.keys(error.getResponse().fieldErrors);
      expect(fields.length).toBeLessThanOrEqual(32); expect(fields.every((field) => field.length <= 200)).toBe(true);
      expect(JSON.stringify(error.getResponse()).length).toBeLessThan(10_000);
    }
  });
});
