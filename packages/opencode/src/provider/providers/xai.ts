/**
 * xAI Provider Implementation
 *
 * Integrates xAI (Grok) models via standard OpenAI-compatible SDK.
 *
 * @module provider/providers/xai
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
 * xAI provider for Grok models.
 *
 * Key behaviors:
 * - Standard OpenAI-compatible SDK integration
 * - Reasoning variants for supported models
 */
export class XAIProvider extends BaseProvider {
  override readonly id = "xai"
  override readonly sdk = "@ai-sdk/xai"
  override readonly name = "xAI"
  override readonly url = "https://x.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.XAI_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("xai")
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
   * Wrap options in xAI namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { xai: options }
  }

  /**
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: false,
      reasoning: "effort",
      modalities: { input: ["text", "image"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get reasoning variants for Grok models.
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const efforts = ["low", "medium", "high"]

    return efforts.map((effort) => ({
      name: effort,
      label: `${effort.charAt(0).toUpperCase()}${effort.slice(1)} Reasoning`,
      options: {
        reasoningEffort: effort,
      },
    }))
  }
}
