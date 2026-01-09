/**
 * Azure Provider Implementation
 *
 * Integrates Azure AI Services OpenAI-compatible models with conditional
 * endpoint routing and OpenAI-style reasoning variants.
 *
 * @module provider/providers/azure
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
  ProviderSDK,
  ModelOptions,
} from "../protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"

/**
 * Azure provider for Azure AI Services OpenAI models.
 *
 * Key behaviors:
 * - Conditional routing between chat() and responses() based on useCompletionUrls
 * - OpenAI-style reasoning variants with encrypted content
 * - Minimal effort added for GPT-5 models
 * - Excludes textVerbosity setting (handled differently by Azure)
 */
export class AzureProvider extends BaseProvider {
  override readonly id = "azure"
  override readonly sdk = "@ai-sdk/azure"
  override readonly name = "Azure"
  override readonly url = "https://azure.microsoft.com/en-us/services/cognitive-services/openai-service"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.AZURE_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("azure")
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
   * Override model retrieval for conditional endpoint routing.
   *
   * When useCompletionUrls option is set, use chat() endpoint.
   * Otherwise, use responses() endpoint (default).
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
   * Wrap options in OpenAI namespace (Azure is OpenAI-compatible).
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { openai: options }
  }

  /**
   * Declare Azure capabilities.
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
   * Get reasoning variants for Azure models.
   *
   * Standard levels: low, medium, high
   * GPT-5 models also get "minimal" level
   * o1-mini has no reasoning support
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const id = model.id.toLowerCase()

    // o1-mini has no reasoning variants
    if (id === "o1-mini") return []

    // Build effort levels
    const efforts: string[] = ["low", "medium", "high"]

    // Add minimal for GPT-5 models
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
