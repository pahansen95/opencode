/**
 * Base Provider Implementation
 *
 * Abstract base class providing default implementations for the ProviderProtocol.
 * Provider implementations should extend this class and override methods as needed.
 *
 * @module provider/base
 */

import type {
  ProviderProtocol,
  ProviderCapabilities,
  ProviderDefaults,
  ProviderOptions,
  NamespacedOptions,
  ProviderSDK,
  Credentials,
  SDKOptions,
  AuthContext,
  OptionsContext,
  HeaderContext,
  ListModelsContext,
  ModelOptions,
  Model,
  ModelMessage,
  ContentPart,
  VariantConfig,
  Modality,
  CacheControl,
  EnvironmentVariables,
  APICallError,
} from "./protocol"
import type { JSONSchema7, LanguageModelV2 } from "@ai-sdk/provider"

/**
 * Abstract base class implementing ProviderProtocol with sensible defaults.
 *
 * Subclasses must implement:
 * - authenticate(ctx): Credential resolution
 * - listModels(ctx): Model enumeration
 * - capabilities(): Provider capability declaration
 * - wrapOptions(options): Option namespacing
 *
 * Optional overrides for provider-specific behavior:
 * - normalizeMessages(): Message transformation
 * - buildOptions(): Option construction
 * - variants(): Reasoning variant configuration
 * - applyCaching(): Cache header application
 * - getHeaders(): Custom request headers
 */
export abstract class BaseProvider implements ProviderProtocol {
  abstract readonly id: string
  abstract readonly sdk: string
  abstract readonly name: string
  readonly url?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Default implementation returns false - providers must opt-in to autoload.
   * Override to detect environment-based authentication (e.g., AWS credential chain).
   */
  autoload(_env: EnvironmentVariables): boolean {
    return false
  }

  /**
   * Abstract - must be implemented by subclass.
   * Resolves credentials from environment, config, auth store, or plugins.
   */
  abstract authenticate(ctx: AuthContext): Promise<Credentials | null>

  /**
   * Default SDK initialization using dynamic import.
   * Override for providers with non-standard SDK initialization.
   */
  async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    const sdkModule = await import(this.sdk)
    const factory = this.getSDKFactory(sdkModule)
    return factory({
      apiKey: credentials.apiKey,
      ...options,
    })
  }

  /**
   * Locate the SDK factory function in the imported module.
   * Tries common naming conventions.
   */
  protected getSDKFactory(sdkModule: any): (options: any) => ProviderSDK {
    // Try common factory names
    if (sdkModule.default) return sdkModule.default
    const factoryName = `create${this.name.replace(/[^a-zA-Z]/g, "")}`
    if (sdkModule[factoryName]) return sdkModule[factoryName]
    throw new Error(`Cannot find SDK factory in ${this.sdk}`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Model Resolution - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Default model retrieval using languageModel or chat methods.
   * Override for providers using responses API or custom routing.
   */
  getModel(
    sdk: ProviderSDK,
    modelID: string,
    _options?: ModelOptions
  ): LanguageModelV2 {
    if (typeof sdk.languageModel === "function") {
      return sdk.languageModel(modelID)
    }
    if (typeof sdk.chat === "function") {
      return sdk.chat(modelID)
    }
    throw new Error(`SDK does not support languageModel or chat methods`)
  }

  /**
   * Abstract - must be implemented by subclass.
   * Returns available models for this provider.
   */
  abstract listModels(ctx: ListModelsContext): Promise<Model[]>

  // ─────────────────────────────────────────────────────────────────────────
  // Message Transformation - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Default implementation returns messages unchanged.
   * Override for provider-specific normalization (tool ID sanitization, etc.).
   */
  normalizeMessages(messages: ModelMessage[], _model: Model): ModelMessage[] {
    return messages
  }

  /**
   * Filter content parts to only include supported modalities.
   */
  filterUnsupportedParts(parts: ContentPart[], model: Model): ContentPart[] {
    const supported = new Set(model.modalities.input)
    return parts.filter((part) => {
      const modality = this.getPartModality(part)
      return supported.has(modality)
    })
  }

  /**
   * Map content part type to modality.
   */
  protected getPartModality(part: ContentPart): Modality {
    switch (part.type) {
      case "text":
      case "reasoning":
      case "tool_call":
      case "tool_result":
        return "text"
      case "image":
        return "image"
      case "audio":
        return "audio"
      case "video":
        return "video"
      case "file":
        return "file"
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Options Building - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build provider options by merging variant and user options.
   * Override to add provider-specific defaults.
   */
  buildOptions(ctx: OptionsContext): ProviderOptions {
    const options: ProviderOptions = {}

    if (ctx.variant) {
      const variantConfig = this.variants(ctx.model).find(
        (v) => v.name === ctx.variant
      )
      if (variantConfig) {
        Object.assign(options, variantConfig.options)
      }
    }

    if (ctx.userOptions) {
      Object.assign(options, ctx.userOptions)
    }

    return options
  }

  /**
   * Default small model options - minimal reasoning.
   * Override for provider-specific fast options.
   */
  buildSmallModelOptions(_model: Model): ProviderOptions {
    return {}
  }

  /**
   * Abstract - must be implemented by subclass.
   * Wraps options in provider-specific namespace.
   */
  abstract wrapOptions(options: ProviderOptions): NamespacedOptions

  /**
   * Calculate max output tokens accounting for reasoning budget.
   */
  calculateMaxOutputTokens(
    options: ProviderOptions,
    modelLimit: number,
    globalLimit: number
  ): number {
    const baseLimit = Math.min(modelLimit, globalLimit)
    const reasoningBudget = options.reasoning?.budgetTokens ?? 0
    return Math.max(baseLimit - reasoningBudget, 1000)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Schema & Error Transformation - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Default implementation returns schema unchanged.
   * Override for providers with schema restrictions (e.g., Gemini integer enums).
   */
  transformSchema(schema: JSONSchema7, _model: Model): JSONSchema7 {
    return schema
  }

  /**
   * Default error transformation returns the message as-is.
   * Override to add provider-specific help text or links.
   */
  transformError(error: APICallError): string {
    return error.message
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Capabilities - Must override
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Abstract - must be implemented by subclass.
   * Declares provider capabilities for routing and feature gating.
   */
  abstract capabilities(): ProviderCapabilities

  /**
   * Default implementation returns empty array.
   * Override to provide reasoning variants for models that support them.
   */
  variants(_model: Model): VariantConfig[] {
    return []
  }

  /**
   * Default provider parameters.
   * Override to provide provider-specific defaults.
   */
  defaults(): ProviderDefaults {
    return {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Caching - Override if supported
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Default implementation returns messages unchanged.
   * Override to apply provider-specific cache control.
   */
  applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    return messages
  }

  /**
   * Check if provider supports caching based on capabilities.
   */
  supportsCaching(): boolean {
    return this.capabilities().caching
  }

  /**
   * Utility to apply cache markers to system and tail messages.
   * Used by providers that support Anthropic-style caching.
   */
  protected applyCacheMarkers(
    messages: ModelMessage[],
    config: {
      systemCount: number
      tailCount: number
      cacheControl: CacheControl
    }
  ): ModelMessage[] {
    const result = [...messages]
    let systemMarked = 0
    let tailMarked = 0

    // Mark system messages from start
    for (let i = 0; i < result.length && systemMarked < config.systemCount; i++) {
      if (result[i].role === "system") {
        result[i] = {
          ...result[i],
          metadata: {
            ...result[i].metadata,
            cacheControl: config.cacheControl,
          },
        }
        systemMarked++
      }
    }

    // Mark non-system messages from end
    for (let i = result.length - 1; i >= 0 && tailMarked < config.tailCount; i--) {
      if (result[i].role !== "system") {
        result[i] = {
          ...result[i],
          metadata: {
            ...result[i].metadata,
            cacheControl: config.cacheControl,
          },
        }
        tailMarked++
      }
    }

    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Headers - Override if needed
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Default implementation returns empty headers.
   * Override to add provider-specific headers (beta features, tracking, etc.).
   */
  getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility Methods for Subclasses
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Sanitize tool call IDs using a regex pattern.
   * Useful for providers with strict ID format requirements.
   */
  protected sanitizeToolCallId(
    id: string,
    pattern: RegExp,
    replacement: string
  ): string {
    return id.replace(pattern, replacement)
  }

  /**
   * Filter out messages with empty content.
   * Useful for providers that reject empty messages.
   */
  protected filterEmptyMessages(messages: ModelMessage[]): ModelMessage[] {
    return messages.filter((m) => {
      if (typeof m.content === "string") {
        return m.content.length > 0
      }
      return m.content.length > 0
    })
  }

  /**
   * Filter empty text/reasoning parts from a message.
   * Useful for providers that reject empty content parts.
   */
  protected filterEmptyParts(message: ModelMessage): ModelMessage {
    if (typeof message.content === "string") return message
    return {
      ...message,
      content: message.content.filter((part) => {
        if (part.type === "text") return part.text.length > 0
        if (part.type === "reasoning") return part.reasoning.length > 0
        return true
      }),
    }
  }

  /**
   * Map tool call IDs in a message using a transformation function.
   * Useful for providers with strict tool ID format requirements.
   */
  protected mapToolCallIds(
    message: ModelMessage,
    mapper: (id: string) => string
  ): ModelMessage {
    if (!message.toolCalls) return message
    return {
      ...message,
      toolCalls: message.toolCalls.map((tc) => ({
        ...tc,
        id: mapper(tc.id),
      })),
    }
  }
}
