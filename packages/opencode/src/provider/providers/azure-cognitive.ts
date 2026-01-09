/**
 * Azure Cognitive Services Provider Implementation
 *
 * Integrates Azure Cognitive Services OpenAI-compatible models with
 * resource name-based URL construction.
 *
 * @module provider/providers/azure-cognitive
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
  VariantConfig,
  ProviderSDK,
  ModelOptions,
} from "../protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"

/**
 * Azure Cognitive Services provider.
 *
 * Key behaviors:
 * - Constructs baseURL from AZURE_COGNITIVE_SERVICES_RESOURCE_NAME
 * - Uses same endpoint routing logic as standard Azure provider
 * - OpenAI-compatible interface
 */
export class AzureCognitiveProvider extends BaseProvider {
  override readonly id = "azure-cognitive-services"
  override readonly sdk = "@ai-sdk/azure"
  override readonly name = "Azure Cognitive Services"
  override readonly url = "https://azure.microsoft.com/en-us/services/cognitive-services"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.AZURE_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("azure-cognitive-services")
    if (stored?.apiKey) return { apiKey: stored.apiKey }

    return null
  }

  /**
   * Initialize SDK with resource name-based URL.
   */
  override async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    const sdkModule = await import(this.sdk)
    const factory = this.getSDKFactory(sdkModule)

    // Get resource name from env
    const resourceName = process.env.AZURE_COGNITIVE_SERVICES_RESOURCE_NAME

    return factory({
      apiKey: credentials.apiKey,
      baseURL: resourceName
        ? `https://${resourceName}.cognitiveservices.azure.com/openai`
        : undefined,
      ...options,
    })
  }

  /**
   * Models are fetched from models.dev.
   */
  override async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  /**
   * Override model retrieval for conditional endpoint routing.
   */
  override getModel(
    sdk: ProviderSDK,
    modelID: string,
    options?: ModelOptions
  ): LanguageModelV2 {
    const useCompletionUrls = (options as any)?.useCompletionUrls

    if (useCompletionUrls) {
      if (typeof sdk.chat === "function") {
        return sdk.chat(modelID)
      }
    }

    if (typeof sdk.responses === "function") {
      return sdk.responses(modelID)
    }

    return super.getModel(sdk, modelID, options)
  }

  /**
   * Wrap options in OpenAI namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { openai: options }
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
   * Get reasoning variants (same as Azure).
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const id = model.id.toLowerCase()
    if (id === "o1-mini") return []

    const efforts: string[] = ["low", "medium", "high"]
    if (id.includes("gpt-5-") || id === "gpt-5") {
      efforts.unshift("minimal")
    }

    return efforts.map((effort) => ({
      name: effort,
      label: `${effort.charAt(0).toUpperCase()}${effort.slice(1)} Reasoning`,
      options: {
        reasoningEffort: effort,
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    }))
  }
}
