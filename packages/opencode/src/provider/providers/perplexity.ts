/**
 * Perplexity Provider Implementation
 *
 * Integrates Perplexity AI via dedicated SDK.
 *
 * @module provider/providers/perplexity
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
} from "../protocol"

/**
 * Perplexity AI provider.
 *
 * Key behaviors:
 * - Uses @ai-sdk/perplexity SDK
 * - PERPLEXITY_API_KEY environment variable
 * - Standard bundled SDK integration
 */
export class PerplexityProvider extends BaseProvider {
  override readonly id = "perplexity"
  override readonly sdk = "@ai-sdk/perplexity"
  override readonly name = "Perplexity"
  override readonly url = "https://perplexity.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.PERPLEXITY_API_KEY ?? ctx.env.PPLX_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("perplexity")
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
   * Wrap options in Perplexity namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { perplexity: options }
  }

  /**
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: false,
      reasoning: "none",
      modalities: { input: ["text"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }
}
