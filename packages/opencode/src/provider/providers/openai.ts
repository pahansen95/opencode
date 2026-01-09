/**
 * OpenAI Provider Implementation
 *
 * Integrates GPT models via the Responses API with release-date-aware
 * reasoning variants and session-based prompt caching.
 *
 * @module provider/providers/openai
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  OptionsContext,
  ListModelsContext,
  Model,
  VariantConfig,
  ProviderSDK,
  ModelOptions,
} from "../protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"

/**
 * OpenAI provider for GPT models.
 *
 * Key behaviors:
 * - Uses sdk.responses() instead of sdk.languageModel() for Responses API
 * - Session-based prompt caching via promptCacheKey
 * - Release-date-aware reasoning variants (none, minimal, low, medium, high, xhigh)
 * - Encrypted reasoning content inclusion
 */
export class OpenAIProvider extends BaseProvider {
  override readonly id = "openai"
  override readonly sdk = "@ai-sdk/openai"
  override readonly name = "OpenAI"
  override readonly url = "https://openai.com"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // 1. Environment variable
    const apiKey = ctx.env.OPENAI_API_KEY
    if (apiKey) return { apiKey }

    // 2. Auth store
    const stored = await ctx.authStore.get("openai")
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
   * Override to use Responses API instead of chat completions.
   *
   * The Responses API is OpenAI's next-generation inference platform
   * supporting reasoning models, structured outputs, and prompt caching.
   */
  override getModel(
    sdk: ProviderSDK,
    modelID: string,
    _options?: ModelOptions
  ): LanguageModelV2 {
    if (typeof sdk.responses === "function") {
      return sdk.responses(modelID)
    }
    return super.getModel(sdk, modelID, _options)
  }

  /**
   * Build options with session-based prompt caching.
   */
  override buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    // Add session caching via promptCacheKey
    if (ctx.sessionID) {
      options.promptCacheKey = ctx.sessionID
    }

    // Add model-specific options for GPT-5 models
    if (ctx.model.id.includes("gpt-5") && !ctx.model.id.includes("gpt-5-chat")) {
      // Default to medium reasoning for non-codex, non-pro models
      if (
        !ctx.model.id.includes("codex") &&
        !ctx.model.id.includes("gpt-5-pro") &&
        !options.reasoningEffort
      ) {
        options.reasoningEffort = "medium"
      }

      // Include encrypted reasoning content
      if (!options.include) {
        options.include = ["reasoning.encrypted_content"]
        options.reasoningSummary = "auto"
      }
    }

    return options
  }

  /**
   * Build options for small/fast models.
   */
  override buildSmallModelOptions(model: Model): ProviderOptions {
    if (model.id.includes("5.")) {
      return { reasoningEffort: "low" }
    }
    return { reasoningEffort: "minimal" }
  }

  /**
   * Wrap options in OpenAI namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { openai: options }
  }

  /**
   * Declare OpenAI capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: true,
      reasoning: "effort",
      modalities: { input: ["text", "image", "audio"], output: ["text", "audio"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get reasoning variants based on model release date.
   *
   * Feature support varies by release date:
   * - All reasoning models: low, medium, high
   * - gpt-5-* models: add minimal
   * - Release >= 2025-11-13: add none
   * - Release >= 2025-12-04: add xhigh
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const id = model.id.toLowerCase()

    // gpt-5-pro has no reasoning variants
    if (id === "gpt-5-pro") return []

    // Build effort levels based on model characteristics
    const efforts: string[] = []

    // Codex models get standard efforts only
    if (id.includes("codex")) {
      return this.buildVariants(["low", "medium", "high"])
    }

    // Add minimal for gpt-5-* models
    if (id.includes("gpt-5-") || id === "gpt-5") {
      efforts.push("minimal")
    }

    // Add none for models released >= 2025-11-13
    if (model.releaseDate && model.releaseDate >= "2025-11-13") {
      efforts.unshift("none")
    }

    // Standard efforts
    efforts.push("low", "medium", "high")

    // Add xhigh for models released >= 2025-12-04
    if (model.releaseDate && model.releaseDate >= "2025-12-04") {
      efforts.push("xhigh")
    }

    return this.buildVariants(efforts)
  }

  /**
   * Build variant configs from effort levels.
   */
  private buildVariants(efforts: string[]): VariantConfig[] {
    return efforts.map((effort) => ({
      name: effort,
      label: this.getEffortLabel(effort),
      options: {
        reasoningEffort: effort,
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    }))
  }

  /**
   * Get human-readable label for effort level.
   */
  private getEffortLabel(effort: string): string {
    const labels: Record<string, string> = {
      none: "No Reasoning",
      minimal: "Minimal Reasoning",
      low: "Low Reasoning",
      medium: "Medium Reasoning",
      high: "High Reasoning",
      xhigh: "Extended High Reasoning",
    }
    return labels[effort] ?? effort
  }
}
