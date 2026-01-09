/**
 * Together AI Provider Implementation
 *
 * Integrates Together AI inference platform via dedicated SDK.
 *
 * @module provider/providers/togetherai
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
 * Together AI provider.
 *
 * Key behaviors:
 * - Uses @ai-sdk/togetherai SDK
 * - TOGETHER_AI_API_KEY environment variable
 * - Standard bundled SDK integration
 */
export class TogetherAIProvider extends BaseProvider {
  override readonly id = "togetherai"
  override readonly sdk = "@ai-sdk/togetherai"
  override readonly name = "Together AI"
  override readonly url = "https://together.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.TOGETHER_AI_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("togetherai")
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
   * Wrap options in Together AI namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { togetherai: options }
  }

  /**
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: false,
      reasoning: "none",
      modalities: { input: ["text", "image"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }
}
