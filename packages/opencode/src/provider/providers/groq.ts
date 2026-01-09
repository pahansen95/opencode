/**
 * Groq Provider Implementation
 *
 * Integrates Groq's fast inference platform with thinkingLevel-based
 * reasoning variants.
 *
 * @module provider/providers/groq
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  ListModelsContext,
  Model,
  VariantConfig,
} from "../protocol"

/**
 * Groq provider for fast inference.
 *
 * Key behaviors:
 * - thinkingLevel variants: none, low, medium, high
 * - includeThoughts for reasoning output
 * - Standard bundled SDK integration
 */
export class GroqProvider extends BaseProvider {
  override readonly id = "groq"
  override readonly sdk = "@ai-sdk/groq"
  override readonly name = "Groq"
  override readonly url = "https://groq.com"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.GROQ_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("groq")
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
   * Wrap options in Groq namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { groq: options }
  }

  /**
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: false,
      reasoning: "budget",
      modalities: { input: ["text"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get thinkingLevel-based reasoning variants.
   *
   * Groq uses thinkingLevel (none, low, medium, high) with includeThoughts.
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const efforts = ["none", "low", "medium", "high"]

    return efforts.map((effort) => ({
      name: effort,
      label: effort === "none"
        ? "No Thinking"
        : `${effort.charAt(0).toUpperCase()}${effort.slice(1)} Thinking`,
      options: {
        includeThoughts: true,
        thinkingLevel: effort,
      },
    }))
  }
}
