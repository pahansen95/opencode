/**
 * Zenmux Provider Implementation
 *
 * Integrates Zenmux AI gateway via OpenAI-compatible SDK.
 *
 * @module provider/providers/zenmux
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  HeaderContext,
  ListModelsContext,
  Model,
} from "../protocol"

/**
 * Zenmux AI gateway provider.
 *
 * Key behaviors:
 * - OpenAI-compatible SDK integration
 * - HTTP-Referer and X-Title headers for tracking
 */
export class ZenmuxProvider extends BaseProvider {
  override readonly id = "zenmux"
  override readonly sdk = "@ai-sdk/openai-compatible"
  override readonly name = "Zenmux"
  override readonly url = "https://zenmux.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.ZENMUX_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("zenmux")
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
   * Get Zenmux custom headers.
   */
  override getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {
      "HTTP-Referer": "https://opencode.ai/",
      "X-Title": "opencode",
    }
  }

  /**
   * Wrap options in Zenmux namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { zenmux: options }
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
