/**
 * Provider Registry
 *
 * Manages provider instances, SDK caching, and credential handling.
 * Central point for provider registration and lookup.
 *
 * @module provider/registry
 */

import type {
  ProviderProtocol,
  IProviderRegistry,
  ProviderInfo,
  ProviderSDK,
  Credentials,
  AuthContext,
} from "./protocol"
import { ProviderInitError } from "./errors"
import { Auth } from "@/auth"
import { Config } from "@/config/config"
import { Plugin } from "@/plugin"

/**
 * Registry for managing provider instances.
 * Handles provider registration, SDK initialization, and caching.
 */
export class ProviderRegistry implements IProviderRegistry {
  private providers = new Map<string, ProviderProtocol>()
  private sdkCache = new Map<string, ProviderSDK>()
  private credentialCache = new Map<string, Credentials>()

  /**
   * Get provider by ID.
   *
   * @param id - Provider identifier
   * @returns Provider instance or undefined
   */
  get(id: string): ProviderProtocol | undefined {
    return this.providers.get(id)
  }

  /**
   * Get provider by ID, throwing if not found.
   *
   * @param id - Provider identifier
   * @returns Provider instance
   * @throws ProviderInitError if not found
   */
  getOrThrow(id: string): ProviderProtocol {
    const provider = this.providers.get(id)
    if (!provider) {
      throw new ProviderInitError(id, "Provider not registered")
    }
    return provider
  }

  /**
   * List all registered providers.
   *
   * @returns Array of provider instances
   */
  list(): ProviderProtocol[] {
    return Array.from(this.providers.values())
  }

  /**
   * List providers with availability status.
   * Checks authentication for each provider.
   *
   * @returns Array of provider info with availability
   */
  async listAvailable(): Promise<ProviderInfo[]> {
    const results: ProviderInfo[] = []
    const authCtx = await this.buildAuthContext()

    for (const provider of this.providers.values()) {
      try {
        const credentials = await provider.authenticate(authCtx)
        const available = credentials !== null

        results.push({
          id: provider.id,
          name: provider.name,
          url: provider.url,
          available,
          unavailableReason: available ? undefined : "No credentials found",
          capabilities: provider.capabilities(),
          models: available ? await provider.listModels({}) : [],
          defaultModel: undefined, // Set by caller if needed
        })
      } catch (error) {
        results.push({
          id: provider.id,
          name: provider.name,
          url: provider.url,
          available: false,
          unavailableReason: error instanceof Error ? error.message : "Unknown error",
          capabilities: provider.capabilities(),
          models: [],
        })
      }
    }

    return results
  }

  /**
   * Register a provider instance.
   *
   * @param provider - Provider to register
   */
  register(provider: ProviderProtocol): void {
    this.providers.set(provider.id, provider)
  }

  /**
   * Unregister a provider.
   *
   * @param id - Provider ID to remove
   */
  unregister(id: string): void {
    this.providers.delete(id)
    this.clearSDKCache(id)
  }

  /**
   * Load provider from npm package.
   *
   * @param npm - NPM package name
   * @returns Loaded provider
   * @throws ProviderInitError if loading fails
   */
  async loadExternal(npm: string): Promise<ProviderProtocol> {
    try {
      const module = await import(npm)
      const provider = module.default as ProviderProtocol

      if (!this.isValidProvider(provider)) {
        throw new Error("Module does not export a valid ProviderProtocol")
      }

      this.register(provider)
      return provider
    } catch (error) {
      throw new ProviderInitError(
        npm,
        `Failed to load external provider: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  /**
   * Get initialized SDK for provider.
   * Caches SDK instances by credential hash.
   *
   * @param provider - Provider to get SDK for
   * @returns Initialized SDK
   * @throws ProviderInitError if credentials not available
   */
  async getSDK(provider: ProviderProtocol): Promise<ProviderSDK> {
    // Check cache
    const cacheKey = this.getSDKCacheKey(provider)
    const cached = this.sdkCache.get(cacheKey)
    if (cached) return cached

    // Get credentials
    const authCtx = await this.buildAuthContext()
    const credentials = await provider.authenticate(authCtx)

    if (!credentials) {
      throw new ProviderInitError(provider.id, "No credentials available")
    }

    // Get SDK options from config
    const config = await Config.get()
    const providerConfig = config.provider?.[provider.id]
    const options = {
      baseURL: providerConfig?.options?.baseURL,
      headers: providerConfig?.options?.headers as Record<string, string> | undefined,
      timeout: providerConfig?.options?.timeout,
    }

    // Initialize SDK
    const sdk = await provider.initializeSDK(credentials, options)

    // Cache and return
    this.sdkCache.set(cacheKey, sdk)
    this.credentialCache.set(provider.id, credentials)

    return sdk
  }

  /**
   * Clear SDK cache for provider.
   *
   * @param providerID - Provider ID to clear cache for
   */
  clearSDKCache(providerID: string): void {
    // Clear all cache entries for this provider
    for (const key of this.sdkCache.keys()) {
      if (key.startsWith(`${providerID}:`)) {
        this.sdkCache.delete(key)
      }
    }
    this.credentialCache.delete(providerID)
  }

  /**
   * Check if provider is available (authenticated).
   *
   * @param id - Provider identifier
   * @returns true if provider is authenticated and ready
   */
  async isAvailable(id: string): Promise<boolean> {
    const provider = this.providers.get(id)
    if (!provider) return false

    try {
      const authCtx = await this.buildAuthContext()
      const credentials = await provider.authenticate(authCtx)
      return credentials !== null
    } catch {
      return false
    }
  }

  /**
   * Build authentication context for providers.
   * Includes environment, config, auth store, and plugins.
   */
  private async buildAuthContext(): Promise<AuthContext> {
    const config = await Config.get()
    const plugins = await Plugin.list()

    return {
      env: process.env as Record<string, string>,
      config: config.provider ?? {},
      authStore: {
        get: async (id) => {
          const auth = await Auth.get(id)
          if (!auth) return null
          if (auth.type === "api") {
            return { apiKey: auth.key }
          }
          if (auth.type === "oauth") {
            return {
              accessToken: auth.access,
              refreshToken: auth.refresh,
              expiresAt: auth.expires,
            }
          }
          return null
        },
        set: async (id, creds) => {
          if (creds.apiKey) {
            await Auth.set(id, { type: "api", key: creds.apiKey })
          }
        },
        delete: async (id) => Auth.remove(id),
        list: async () => Object.keys(await Auth.all()),
      },
      plugins: plugins.map((hook) => ({
        id: (hook as any).id ?? "unknown",
        auth: (hook as any).auth,
      })),
      projectRoot: process.cwd(),
    }
  }

  /**
   * Generate cache key for SDK based on provider and credentials.
   */
  private getSDKCacheKey(provider: ProviderProtocol): string {
    const credentials = this.credentialCache.get(provider.id)
    const credHash = credentials
      ? Bun.hash(JSON.stringify(credentials)).toString(16)
      : "none"
    return `${provider.id}:${credHash}`
  }

  /**
   * Validate that an object implements ProviderProtocol.
   */
  private isValidProvider(obj: unknown): obj is ProviderProtocol {
    if (typeof obj !== "object" || obj === null) return false
    const p = obj as Partial<ProviderProtocol>
    return (
      typeof p.id === "string" &&
      typeof p.sdk === "string" &&
      typeof p.authenticate === "function" &&
      typeof p.capabilities === "function"
    )
  }
}
