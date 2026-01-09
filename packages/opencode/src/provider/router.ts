/**
 * Provider Router
 *
 * Routes requests to appropriate providers based on task type,
 * modalities, and user preferences. Supports fallback selection.
 *
 * @module provider/router
 */

import type {
  IProviderRouter,
  ProviderProtocol,
  RouteContext,
  RoutingStrategy,
} from "./protocol"
import { CapabilityRoutingStrategy } from "./strategies/capability"

/**
 * Router for selecting providers based on request characteristics.
 * Implements routing strategies and fallback logic.
 */
export class ProviderRouter implements IProviderRouter {
  private strategy: RoutingStrategy
  private registry: {
    list(): ProviderProtocol[]
    isAvailable(id: string): Promise<boolean>
  }

  /**
   * Create a new router with the given registry and optional strategy.
   *
   * @param registry - Registry providing available providers
   * @param strategy - Routing strategy (defaults to capability-based)
   */
  constructor(
    registry: {
      list(): ProviderProtocol[]
      isAvailable(id: string): Promise<boolean>
    },
    strategy?: RoutingStrategy
  ) {
    this.registry = registry
    this.strategy = strategy ?? new CapabilityRoutingStrategy()
  }

  /**
   * Route request to appropriate provider.
   *
   * @param ctx - Routing context with request characteristics
   * @returns Selected provider
   * @throws Error if no suitable provider available
   */
  route(ctx: RouteContext): ProviderProtocol {
    const available = this.getAvailableProviders(ctx)
    if (available.length === 0) {
      throw new Error("No providers available for request")
    }
    return this.strategy.select(ctx, available)
  }

  /**
   * Get fallback provider after failure.
   *
   * @param ctx - Original routing context
   * @param failed - Provider that failed
   * @param error - Error that occurred
   * @returns Fallback provider or null if none available
   */
  fallback(
    ctx: RouteContext,
    failed: ProviderProtocol,
    error: Error
  ): ProviderProtocol | null {
    const available = this.getAvailableProviders(ctx).filter(
      (p) => p.id !== failed.id
    )
    if (available.length === 0) return null
    return this.strategy.selectFallback(ctx, failed, error, available)
  }

  /**
   * Set routing strategy.
   *
   * @param strategy - Routing strategy to use
   */
  setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy
  }

  /**
   * Get current routing strategy.
   *
   * @returns Current strategy
   */
  getStrategy(): RoutingStrategy {
    return this.strategy
  }

  /**
   * Get providers available for the given context.
   * Filters by explicit hints, blocked providers, and required modalities.
   */
  private getAvailableProviders(ctx: RouteContext): ProviderProtocol[] {
    let providers = this.registry.list()

    // Filter by explicit hint
    if (ctx.providerHint) {
      const hinted = providers.find((p) => p.id === ctx.providerHint)
      if (hinted) return [hinted]
    }

    // Filter by preferences
    if (ctx.preferences?.blockedProviders) {
      const blocked = new Set(ctx.preferences.blockedProviders)
      providers = providers.filter((p) => !blocked.has(p.id))
    }

    // Filter by required modalities
    if (ctx.modalities.size > 0) {
      providers = providers.filter((p) => {
        const caps = p.capabilities()
        return [...ctx.modalities].every((m) => caps.modalities.input.includes(m))
      })
    }

    return providers
  }
}
