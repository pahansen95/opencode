/**
 * DeepInfra Provider Implementation
 *
 * Integrates DeepInfra inference platform via standard SDK.
 *
 * @module provider/providers/deepinfra
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
 * DeepInfra provider.
 *
 * Key behaviors:
 * - Standard bundled SDK integration
 * - No reasoning variants
 */
export class DeepInfraProvider extends BaseProvider {
  override readonly id = "deepinfra"
  override readonly sdk = "@ai-sdk/deepinfra"
  override readonly name = "DeepInfra"
  override readonly url = "https://deepinfra.com"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.DEEPINFRA_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("deepinfra")
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
   * Wrap options in DeepInfra namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { deepinfra: options }
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
