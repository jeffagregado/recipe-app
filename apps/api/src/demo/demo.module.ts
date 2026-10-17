import { Global, Module } from '@nestjs/common';
import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DemoController } from './demo.controller.js';
import { DemoStartService } from './demo-start.service.js';
import { DEMO_RECIPE_POLICY, DemoRecipePolicy } from './demo-recipe-policy.js';
import { DEMO_REFUSED_ROUTES, refuseInDemo } from './demo-refusals.js';

/** The live demo's endpoints and refusals (issue #112). Global, so the recipe services find its policy without importing it. */
@Global()
@Module({
  imports: [DatabaseModule, StorageModule, AuthModule],
  controllers: [DemoController],
  providers: [DemoStartService, { provide: DEMO_RECIPE_POLICY, useClass: DemoRecipePolicy }],
  exports: [DEMO_RECIPE_POLICY],
})
export class DemoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(refuseInDemo).forRoutes(...DEMO_REFUSED_ROUTES);
  }
}

/**
 * Registered only when `DEMO_MODE` is on; off, the API is the one on master. The condition reads `process.env`, where the
 * configuration module has copied the validated value (`true` or `false`) unless the process already set it.
 */
export const demoModeModule = () => ConditionalModule.registerWhen(DemoModule, (env) => env.DEMO_MODE === 'true', { debug: false });
