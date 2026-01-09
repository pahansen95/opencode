/**
 * OpenCode Provider Implementation
 *
 * Integrates OpenCode's hosted models (Zen subscription) with session-based
 * caching and encrypted reasoning support.
 *
 * @module provider/providers/opencode
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
} from "../protocol"

/**
 * OpenCode internal provider for Zen subscription models.
 *
 * Key behaviors:
 * - Session-based prompt caching (promptCacheKey)
 * - Encrypted reasoning content inclusion
 * - Auto reasoning summary
 */
export class OpenCodeProvider extends BaseProvider {
  override readonly id = "opencode"
  override readonly sdk = "@ai-sdk/openai"
  override readonly name = "OpenCode"
  override readonly url = "https://opencode.ai"

  /**
   * Resolve credentials from auth store (managed by OpenCode).
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Auth store
    const stored = await ctx.authStore.get("opencode")
    if (stored?.apiKey) return { apiKey: stored.apiKey }
    if (stored?.accessToken) return { bearerToken: stored.accessToken }

    return null
  }

  /**
   * Models are fetched from models.dev.
   */
  override async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  /**
   * Build options with session caching and reasoning.
   */
  override buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    // Add session caching
    if (ctx.sessionID) {
      options.promptCacheKey = ctx.sessionID
    }

    // Add encrypted reasoning for GPT-5 models
    if (ctx.model.id.includes("gpt-5")) {
      options.include = ["reasoning.encrypted_content"]
      options.reasoningSummary = "auto"
    }

    return options
  }

  /**
   * Wrap options in OpenAI namespace (uses OpenAI backend).
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { openai: options }
  }

  /**
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: true,
      reasoning: "effort",
      modalities: { input: ["text", "image"], output: ["text"] },
      authentication: ["api_key", "oauth"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get reasoning variants (same as OpenAI).
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const id = model.id.toLowerCase()
    if (id === "gpt-5-pro") return []

    const efforts: string[] = []

    if (id.includes("gpt-5-") || id === "gpt-5") {
      efforts.push("minimal")
    }

    if (model.releaseDate && model.releaseDate >= "2025-11-13") {
      efforts.unshift("none")
    }

    efforts.push("low", "medium", "high")

    if (model.releaseDate && model.releaseDate >= "2025-12-04") {
      efforts.push("xhigh")
    }

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
