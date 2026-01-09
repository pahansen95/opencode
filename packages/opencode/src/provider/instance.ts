/**
 * Provider Instance Management
 *
 * Singleton instances for provider registry, model registry, and router.
 * Provides lazy initialization and convenient accessors.
 *
 * @module provider/instance
 */

import { ProviderRegistry } from "./registry"
import { ModelRegistry } from "./model-registry"
import { ProviderRouter } from "./router"

import { registerBundledProviders } from "./providers"

// Singleton instances
let _registry: ProviderRegistry | null = null
let _models: ModelRegistry | null = null
let _router: ProviderRouter | null = null

/**
 * Get the provider registry singleton.
 * Lazily initializes and registers bundled providers.
 *
 * @returns Provider registry instance
 */
export function getRegistry(): ProviderRegistry {
  if (!_registry) {
    _registry = new ProviderRegistry()
    registerBundledProviders(_registry)
  }
  return _registry
}

/**
 * Get the model registry singleton.
 * Note: Call initialize() to load model data.
 *
 * @returns Model registry instance
 */
export function getModels(): ModelRegistry {
  if (!_models) {
    _models = new ModelRegistry()
  }
  return _models
}

/**
 * Get the provider router singleton.
 * Uses the default capability-based routing strategy.
 *
 * @returns Provider router instance
 */
export function getRouter(): ProviderRouter {
  if (!_router) {
    _router = new ProviderRouter(getRegistry())
  }
  return _router
}

/**
 * Convenience accessor for registry.
 * Usage: registry.current.get("anthropic")
 */
export const registry = {
  get current() {
    return getRegistry()
  },
}

/**
 * Convenience accessor for models.
 * Usage: models.current.get("anthropic", "claude-sonnet-4")
 */
export const models = {
  get current() {
    return getModels()
  },
}

/**
 * Convenience accessor for router.
 * Usage: router.current.route(ctx)
 */
export const router = {
  get current() {
    return getRouter()
  },
}

/**
 * Initialize all provider singletons.
 * Should be called at application startup.
 *
 * @returns Promise that resolves when initialization is complete
 */
export async function initialize(): Promise<void> {
  await getModels().initialize()
}
