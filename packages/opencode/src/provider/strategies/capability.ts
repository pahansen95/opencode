/**
 * Capability-Based Routing Strategy
 *
 * Routes requests to providers based on capability matching and task affinity.
 * Scores providers and selects the best match for each request.
 *
 * @module provider/strategies/capability
 */

import type {
  RoutingStrategy,
  ProviderProtocol,
  RouteContext,
  TaskType,
} from "../protocol"

/**
 * Task-to-provider affinity mapping.
 * Providers listed first have higher affinity for the task.
 */
const TASK_PROVIDER_AFFINITY: Record<TaskType, string[]> = {
  reasoning: ["anthropic", "openai", "google"],
  code: ["anthropic", "openai", "github-copilot"],
  vision: ["openai", "google", "anthropic"],
  summarization: ["groq", "cerebras", "anthropic"],
  extraction: ["openai", "anthropic"],
  conversation: ["anthropic", "openai", "google"],
  embedding: ["openai", "google"],
  "sub-task": ["groq", "cerebras", "anthropic"],
}

/**
 * Capability-based routing strategy.
 * Scores providers based on task affinity and capabilities.
 */
export class CapabilityRoutingStrategy implements RoutingStrategy {
  readonly name = "capability"

  /**
   * Select the best provider for a request.
   * Scores each provider and returns the highest scoring one.
   *
   * @param ctx - Routing context
   * @param available - Available providers
   * @returns Selected provider
   */
  select(ctx: RouteContext, available: ProviderProtocol[]): ProviderProtocol {
    // Score each provider
    const scored = available.map((p) => ({
      provider: p,
      score: this.score(p, ctx),
    }))

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    return scored[0].provider
  }

  /**
   * Select fallback provider after failure.
   * Simply selects the best remaining provider.
   *
   * @param ctx - Routing context
   * @param _failed - Failed provider (unused)
   * @param _error - Error that occurred (unused)
   * @param remaining - Remaining providers
   * @returns Fallback provider or null
   */
  selectFallback(
    ctx: RouteContext,
    _failed: ProviderProtocol,
    _error: Error,
    remaining: ProviderProtocol[]
  ): ProviderProtocol | null {
    if (remaining.length === 0) return null
    return this.select(ctx, remaining)
  }

  /**
   * Score a provider for a given context.
   * Higher scores indicate better fit.
   */
  private score(provider: ProviderProtocol, ctx: RouteContext): number {
    let score = 0
    const caps = provider.capabilities()

    // Task affinity
    const affinity = TASK_PROVIDER_AFFINITY[ctx.task] ?? []
    const affinityIndex = affinity.indexOf(provider.id)
    if (affinityIndex >= 0) {
      score += (affinity.length - affinityIndex) * 10
    }

    // Reasoning support for reasoning tasks
    if (ctx.task === "reasoning" && caps.reasoning !== "none") {
      score += 20
    }

    // Caching support
    if (caps.caching) {
      score += 5
    }

    // Preference boost
    if (ctx.preferences?.preferredProviders?.includes(provider.id)) {
      score += 50
    }

    return score
  }
}
