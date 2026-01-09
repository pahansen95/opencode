/**
 * OpenRouter Provider Implementation
 *
 * Integrates OpenRouter multi-model gateway with custom headers
 * and ephemeral caching support.
 *
 * @module provider/providers/openrouter
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  OptionsContext,
  HeaderContext,
  ListModelsContext,
  Model,
  ModelMessage,
  VariantConfig,
  ReasoningEffort,
} from "../protocol"

/**
 * OpenRouter multi-model gateway provider.
 *
 * Key behaviors:
 * - HTTP-Referer and X-Title headers for tracking
 * - Ephemeral caching support
 * - OpenAI-style effort variants for select models
 * - Usage tracking enabled by default
 */
export class OpenRouterProvider extends BaseProvider {
  override readonly id = "openrouter"
  override readonly sdk = "@openrouter/ai-sdk-provider"
  override readonly name = "OpenRouter"
  override readonly url = "https://openrouter.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.OPENROUTER_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("openrouter")
    if (stored?.apiKey) return { apiKey: stored.apiKey }

    return null
  }

  /**
   * Models are fetched from models.dev.
   */
  override async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  /**
   * Build options with usage tracking and default reasoning.
   */
  override buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    // Enable usage tracking
    options.usage = { include: true }

    // Set default high reasoning for Gemini-3 models
    if (ctx.model.api?.npm?.includes("gemini-3")) {
      options.reasoning = { effort: "high" }
    }

    return options
  }

  /**
   * Build options for small/fast models.
   */
  override buildSmallModelOptions(model: Model): ProviderOptions {
    if (model.api?.npm?.includes("google")) {
      return { reasoning: { effort: "none" } }
    }
    return { reasoningEffort: "minimal" }
  }

  /**
   * Apply ephemeral caching to messages.
   */
  override applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    const result = [...messages]
    const system = result.filter((msg) => msg.role === "system").slice(0, 2)
    const final = result.filter((msg) => msg.role !== "system").slice(-2)

    const cacheOptions = {
      openrouter: {
        cacheControl: { type: "ephemeral" },
      },
    }

    for (const msg of [...system, ...final]) {
      if (Array.isArray(msg.content) && msg.content.length > 0) {
        const lastContent = msg.content[msg.content.length - 1]
        if (lastContent && typeof lastContent === "object") {
          ;(lastContent as any).providerOptions = {
            ...(lastContent as any).providerOptions,
            ...cacheOptions,
          }
          continue
        }
      }
      ;(msg as any).providerOptions = {
        ...(msg as any).providerOptions,
        ...cacheOptions,
      }
    }

    return result
  }

  /**
   * Get OpenRouter custom headers.
   */
  override getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {
      "HTTP-Referer": "https://opencode.ai/",
      "X-Title": "opencode",
    }
  }

  /**
   * Wrap options in OpenRouter namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { openrouter: options }
  }

  /**
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: true,
      reasoning: "effort",
      modalities: { input: ["text", "image"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get reasoning variants for supported models.
   *
   * Only GPT, Gemini-3, and Grok-4 models return variants.
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const id = model.id.toLowerCase()

    // Only specific models get variants
    if (
      !id.includes("gpt") &&
      !id.includes("gemini-3") &&
      !id.includes("grok-4")
    ) {
      return []
    }

    const efforts: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "max"]

    return efforts.map((effort) => ({
      name: effort,
      label: `${effort.charAt(0).toUpperCase()}${effort.slice(1)} Reasoning`,
      options: {
        reasoning: { effort },
      },
    }))
  }
}
