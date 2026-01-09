/**
 * Cerebras Provider Implementation
 *
 * Integrates Cerebras inference platform with custom header support.
 *
 * @module provider/providers/cerebras
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
 * Cerebras provider.
 *
 * Key behaviors:
 * - Custom header support
 * - Standard bundled SDK integration
 * - No reasoning variants
 */
export class CerebrasProvider extends BaseProvider {
  override readonly id = "cerebras"
  override readonly sdk = "@ai-sdk/cerebras"
  override readonly name = "Cerebras"
  override readonly url = "https://cerebras.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.CEREBRAS_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("cerebras")
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
   * Get custom headers for Cerebras.
   */
  override getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {
      "X-Client": "opencode",
    }
  }

  /**
   * Wrap options in Cerebras namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { cerebras: options }
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
