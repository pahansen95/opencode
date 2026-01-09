/**
 * AI Gateway Provider Implementation
 *
 * Integrates standard AI Gateway via @ai-sdk/gateway SDK.
 * Note: This is different from cloudflare-ai-gateway which uses
 * a custom Cloudflare-specific implementation.
 *
 * @module provider/providers/gateway
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
 * AI Gateway provider.
 *
 * Key behaviors:
 * - Uses @ai-sdk/gateway SDK
 * - Standard gateway integration for AI model routing
 */
export class GatewayProvider extends BaseProvider {
  override readonly id = "gateway"
  override readonly sdk = "@ai-sdk/gateway"
  override readonly name = "AI Gateway"
  override readonly url = "https://gateway.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.GATEWAY_API_KEY ?? ctx.env.AI_GATEWAY_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("gateway")
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
   * Wrap options in Gateway namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { gateway: options }
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
