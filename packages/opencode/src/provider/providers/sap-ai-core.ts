/**
 * SAP AI Core Provider Implementation
 *
 * Integrates SAP AI Core generative AI hub with OpenAI-compatible SDK.
 * Uses AICORE_SERVICE_KEY for authentication.
 *
 * @module provider/providers/sap-ai-core
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  SDKOptions,
  ListModelsContext,
  Model,
  ProviderSDK,
  EnvironmentVariables,
} from "../protocol"

/**
 * SAP AI Core provider for enterprise generative AI.
 *
 * Key behaviors:
 * - Uses AICORE_SERVICE_KEY environment variable for auth
 * - Supports deployment ID and resource group configuration
 * - OpenAI-compatible SDK integration
 */
export class SapAiCoreProvider extends BaseProvider {
  override readonly id = "sap-ai-core"
  override readonly sdk = "@ai-sdk/openai-compatible"
  override readonly name = "SAP AI Core"
  override readonly url = "https://www.sap.com/products/artificial-intelligence/ai-core.html"

  /**
   * Check if provider should auto-load based on service key.
   */
  override autoload(env: EnvironmentVariables): boolean {
    return !!env.AICORE_SERVICE_KEY
  }

  /**
   * Resolve credentials from env or auth store.
   * SAP AI Core uses service key JSON for authentication.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const serviceKey = ctx.env.AICORE_SERVICE_KEY
    if (serviceKey) {
      return { custom: { serviceKey } }
    }

    // Auth store
    const stored = await ctx.authStore.get("sap-ai-core")
    if (stored?.apiKey) {
      return { custom: { serviceKey: stored.apiKey } }
    }

    return null
  }

  /**
   * Initialize SDK with SAP AI Core configuration.
   */
  override async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    const sdkModule = await import(this.sdk)
    const factory = sdkModule.createOpenAICompatible ?? sdkModule.default

    return factory({
      ...options,
      name: this.id,
    })
  }

  /**
   * Models are fetched from models.dev.
   */
  override async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  /**
   * Wrap options in SAP AI Core namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { "sap-ai-core": options }
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
