/**
 * Model Registry
 *
 * Manages model metadata from models.dev with local caching and fuzzy search.
 * Handles model lookup, parsing, sorting, and configuration overrides.
 *
 * @module provider/model-registry
 */

import type {
  IModelRegistry,
  Model,
  ModelReference,
} from "./protocol"
import { ModelNotFoundError } from "./errors"
import { Config } from "@/config/config"
import fuzzysort from "fuzzysort"

/** Model priority for sorting - higher priority models appear first */
const MODEL_PRIORITY = [
  "gpt-5",
  "gpt-4.1",
  "claude-sonnet-4",
  "claude-opus",
  "gemini-2",
  "o1",
  "o3",
]

/**
 * Registry for managing model metadata.
 * Fetches from models.dev, caches locally, supports fuzzy search.
 */
export class ModelRegistry implements IModelRegistry {
  private models = new Map<string, Map<string, Model>>()
  private modelsCacheFile = `${process.env.HOME}/.cache/opencode/models.json`
  private lastRefresh = 0
  private refreshInterval = 60 * 60 * 1000 // 1 hour

  /**
   * Initialize the registry by loading from cache.
   * Should be called before using the registry.
   */
  async initialize(): Promise<void> {
    await this.loadFromCache()
    this.scheduleRefresh()
  }

  /**
   * Get model by provider and model ID.
   *
   * @param providerID - Provider identifier
   * @param modelID - Model identifier
   * @returns Model or undefined
   */
  get(providerID: string, modelID: string): Model | undefined {
    return this.models.get(providerID)?.get(modelID)
  }

  /**
   * Get model, throwing if not found.
   *
   * @param providerID - Provider identifier
   * @param modelID - Model identifier
   * @returns Model
   * @throws ModelNotFoundError
   */
  getOrThrow(providerID: string, modelID: string): Model {
    const model = this.get(providerID, modelID)
    if (!model) {
      const suggestions = this.getSuggestions(providerID, modelID)
      throw new ModelNotFoundError(providerID, modelID, suggestions)
    }
    return model
  }

  /**
   * List models, optionally filtered by provider.
   *
   * @param providerID - Optional provider filter
   * @returns Array of models
   */
  list(providerID?: string): Model[] {
    if (providerID) {
      return Array.from(this.models.get(providerID)?.values() ?? [])
    }
    const all: Model[] = []
    for (const providerModels of this.models.values()) {
      all.push(...providerModels.values())
    }
    return all
  }

  /**
   * Refresh model data from models.dev.
   * Saves to local cache on success.
   */
  async refresh(): Promise<void> {
    try {
      const response = await fetch("https://models.dev/api.json")
      const data = await response.json()

      // Clear and repopulate
      this.models.clear()

      for (const [providerID, providerData] of Object.entries(data.providers)) {
        const providerModels = new Map<string, Model>()
        const pd = providerData as { models: Record<string, any> }

        for (const [modelID, modelData] of Object.entries(pd.models)) {
          providerModels.set(modelID, this.normalizeModel(providerID, modelID, modelData))
        }

        this.models.set(providerID, providerModels)
      }

      // Apply config overrides
      await this.applyConfigOverrides()

      // Save to cache
      await this.saveToCache()

      this.lastRefresh = Date.now()
    } catch (error) {
      console.error("Failed to refresh models:", error)
      // Keep existing data if refresh fails
    }
  }

  /**
   * Parse model string into provider/model IDs.
   * Supports formats: "providerID/modelID", "modelID" (infers provider)
   *
   * @param modelString - Model string to parse
   * @returns Parsed provider and model IDs
   */
  parse(modelString: string): ModelReference {
    const parts = modelString.split("/")
    if (parts.length >= 2) {
      // Handle formats like "provider/model" or "provider/model/version"
      return { providerID: parts[0], modelID: parts.slice(1).join("/") }
    }
    // Try to infer provider from model ID
    for (const [providerID, models] of this.models) {
      if (models.has(modelString)) {
        return { providerID, modelID: modelString }
      }
    }
    // Default to first available provider, or fallback to "anthropic"
    const firstProvider = this.models.keys().next().value
    const defaultProvider = firstProvider ?? "anthropic"
    return { providerID: defaultProvider, modelID: modelString }
  }

  /**
   * Sort models by priority/quality.
   *
   * @param models - Models to sort
   * @returns Sorted models (best first)
   */
  sort(models: Model[]): Model[] {
    return [...models].sort((a, b) => {
      const aPriority = this.getModelPriority(a)
      const bPriority = this.getModelPriority(b)
      if (aPriority !== bPriority) return aPriority - bPriority
      // Secondary sort by name
      return a.name.localeCompare(b.name)
    })
  }

  /**
   * Find closest matching model by query strings.
   * Uses fuzzy matching against model ID, name, and family.
   *
   * @param providerID - Provider to search
   * @param queries - Search queries
   * @returns Best matching model or undefined
   */
  closest(providerID: string, queries: string[]): Model | undefined {
    const models = this.list(providerID)
    if (models.length === 0) return undefined

    const targets = models.map((m) => ({
      model: m,
      searchable: `${m.id} ${m.name} ${m.family}`,
    }))

    for (const query of queries) {
      const results = fuzzysort.go(query, targets, {
        key: "searchable",
        threshold: -10000,
      })
      if (results.length > 0) {
        return results[0].obj.model
      }
    }

    return undefined
  }

  /**
   * Get default model from configuration.
   * Reads from config.model if set, otherwise finds first available model
   * sorted by priority.
   *
   * @returns Default model
   * @throws Error if no default configured or model not found
   */
  async default(): Promise<Model> {
    const config = await Config.get()

    // First check if a default model is configured
    if (config.model) {
      const { providerID, modelID } = this.parse(config.model)
      return this.getOrThrow(providerID, modelID)
    }

    // Otherwise, find the best available model from loaded providers
    const allModels = this.list()
    if (allModels.length === 0) {
      // Fallback to hardcoded default as last resort
      const { providerID, modelID } = this.parse("anthropic/claude-sonnet-4")
      return this.getOrThrow(providerID, modelID)
    }

    // Sort and return the best model
    const sorted = this.sort(allModels)
    return sorted[0]
  }

  /**
   * Get small/fast model for sub-tasks.
   *
   * @param providerID - Provider to get small model for
   * @returns Small model for provider
   * @throws ModelNotFoundError if no models available for provider
   */
  small(providerID: string): Model {
    const models = this.list(providerID)
    if (models.length === 0) {
      throw new ModelNotFoundError(providerID, "*", ["No models available for provider"])
    }
    const sorted = models.sort((a, b) => a.cost.input - b.cost.input)
    return sorted[0]
  }

  /**
   * Register model override from configuration.
   *
   * @param providerID - Provider ID
   * @param modelID - Model ID
   * @param overrides - Partial model data to merge
   */
  registerOverride(
    providerID: string,
    modelID: string,
    overrides: Partial<Model>
  ): void {
    const existing = this.get(providerID, modelID)
    if (!existing) return

    const merged = { ...existing, ...overrides }
    this.models.get(providerID)?.set(modelID, merged)
  }

  /**
   * Normalize raw model data from models.dev into Model type.
   */
  private normalizeModel(
    providerID: string,
    modelID: string,
    data: any
  ): Model {
    return {
      id: modelID,
      providerID,
      name: data.name ?? modelID,
      family: data.family ?? "unknown",
      status: data.status ?? "active",
      capabilities: {
        reasoning: data.reasoning ?? false,
        temperature: data.temperature ?? true,
        toolCall: data.tool_call ?? true,
        attachment: data.attachment ?? false,
        structuredOutput: data.structured_output ?? true,
        streaming: data.streaming ?? true,
        systemMessage: data.system_message ?? true,
        multiTurn: data.multi_turn ?? true,
        interleaved: data.interleaved,
      },
      modalities: {
        input: data.modalities?.input ?? ["text"],
        output: data.modalities?.output ?? ["text"],
      },
      limits: {
        context: data.limit?.context ?? 128000,
        output: data.limit?.output ?? 4096,
        reasoning: data.limit?.reasoning,
      },
      cost: {
        input: data.cost?.input ?? 0,
        output: data.cost?.output ?? 0,
        cache: data.cost?.cache_read !== undefined || data.cost?.cache_write !== undefined
          ? {
              read: data.cost?.cache_read ?? 0,
              write: data.cost?.cache_write ?? 0,
            }
          : undefined,
        cachedInput: data.cost?.cached_input,
        reasoning: data.cost?.reasoning,
      },
      api: {
        npm: data.api?.npm ?? `@ai-sdk/${providerID}`,
        baseURL: data.api?.base_url,
        version: data.api?.version,
      },
      aliases: data.aliases,
      releaseDate: data.release_date,
    }
  }

  /**
   * Get model priority for sorting (lower is better).
   */
  private getModelPriority(model: Model): number {
    for (let i = 0; i < MODEL_PRIORITY.length; i++) {
      if (model.id.includes(MODEL_PRIORITY[i])) return i
    }
    return MODEL_PRIORITY.length
  }

  /**
   * Get model name suggestions for error messages.
   */
  private getSuggestions(providerID: string, query: string): string[] {
    const models = this.list(providerID)
    const results = fuzzysort.go(query, models, {
      key: "id",
      limit: 3,
      threshold: -10000,
    })
    return results.map((r) => r.obj.id)
  }

  /**
   * Apply configuration overrides to models.
   */
  private async applyConfigOverrides(): Promise<void> {
    const config = await Config.get()
    if (!config.provider) return

    for (const [providerID, providerConfig] of Object.entries(config.provider)) {
      if (!providerConfig.models) continue

      for (const [modelID, modelOverrides] of Object.entries(providerConfig.models)) {
        this.registerOverride(providerID, modelID, modelOverrides as Partial<Model>)
      }
    }
  }

  /**
   * Load models from local cache.
   */
  private async loadFromCache(): Promise<void> {
    try {
      const file = Bun.file(this.modelsCacheFile)
      if (await file.exists()) {
        const data = await file.json()
        // Populate from cache
        for (const [providerID, models] of Object.entries(data)) {
          const providerModels = new Map<string, Model>()
          for (const [modelID, model] of Object.entries(models as Record<string, Model>)) {
            providerModels.set(modelID, model)
          }
          this.models.set(providerID, providerModels)
        }
      }
    } catch {
      // Cache doesn't exist or is invalid, will refresh
    }
  }

  /**
   * Save models to local cache.
   */
  private async saveToCache(): Promise<void> {
    try {
      const data: Record<string, Record<string, Model>> = {}
      for (const [providerID, models] of this.models) {
        data[providerID] = Object.fromEntries(models)
      }

      // Ensure cache directory exists
      const cacheDir = this.modelsCacheFile.replace(/\/[^/]+$/, "")
      await Bun.write(this.modelsCacheFile, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error("Failed to save models cache:", error)
    }
  }

  /**
   * Schedule periodic model refresh.
   */
  private scheduleRefresh(): void {
    setInterval(() => {
      if (Date.now() - this.lastRefresh > this.refreshInterval) {
        this.refresh()
      }
    }, this.refreshInterval)
  }
}
