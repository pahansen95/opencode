/**
 * Vercel AI Provider Implementation
 *
 * Integrates Vercel AI SDK for Vercel-hosted AI models.
 *
 * @module provider/providers/vercel
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
 * Vercel AI provider.
 *
 * Key behaviors:
 * - Standard @ai-sdk/vercel integration
 * - HTTP-Referer and X-Title headers for tracking
 */
export class VercelProvider extends BaseProvider {
  override readonly id = "vercel"
  override readonly sdk = "@ai-sdk/vercel"
  override readonly name = "Vercel"
  override readonly url = "https://vercel.com/ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.VERCEL_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("vercel")
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
   * Get Vercel custom headers.
   */
  override getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {
      "http-referer": "https://opencode.ai/",
      "x-title": "opencode",
    }
  }

  /**
   * Wrap options in Vercel namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { vercel: options }
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
