import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ResilienceEvents } from '@nestjs/resilience';
import type { Subscription } from 'rxjs';

@Injectable()
export class RecipesResilienceLogger implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RecipesResilienceLogger.name);
  private subscription?: Subscription;

  constructor(private readonly events: ResilienceEvents) {}

  onModuleInit(): void {
    this.subscription = this.events.events$.subscribe((event) => {
      if (event.policy !== 'recipeRead' && event.policy !== 'recipeDatabase') return;
      // Log policy state only; database errors may contain SQL or connection details.
      if (event.type === 'circuit-closed' || event.type === 'circuit-half-open') {
        this.logger.log(`${event.policy}: ${event.type}`);
      } else {
        this.logger.warn(`${event.policy}: ${event.type}`);
      }
    });
  }

  onApplicationShutdown(): void {
    this.subscription?.unsubscribe();
  }
}
