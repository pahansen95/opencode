/**
 * GitHub Copilot Provider Implementation
 *
 * Integrates GitHub Copilot models via OpenAI-compatible SDK with
 * OAuth plugin authentication and dual model routing.
 *
 * @module provider/providers/github-copilot
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
  ProviderSDK,
  ModelOptions,
  APICallError,
} from "../protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"

/**
 * GitHub Copilot provider.
 *
 * Key behaviors:
 * - OAuth plugin authentication (opencode-copilot-auth)
 * - Dual routing: codex models -> responses(), others -> chat()
 * - Error message enhancement with settings link
 * - OpenAI-compatible option namespace
 */
export class GitHubCopilotProvider extends BaseProvider {
  override readonly id: string = "github-copilot"
  override readonly sdk: string = "@ai-sdk/github-copilot"
  override readonly name: string = "GitHub Copilot"
  override readonly url: string = "https://github.com/features/copilot"

  /**
   * Resolve credentials from OAuth plugin or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Check auth store first
    const stored = await ctx.authStore.get("github-copilot")
    if (stored?.apiKey) return { apiKey: stored.apiKey }
    if (stored?.accessToken) return { bearerToken: stored.accessToken }

    // Check for OAuth plugin
    const plugin = ctx.plugins.find(
      (p) => p.id === "opencode-copilot-auth" && p.auth?.loader
    )
    if (plugin?.auth?.loader) {
      return plugin.auth.loader(ctx)
    }

    return null
  }

  /**
   * Models are fetched from models.dev.
   */
  override async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  /**
   * Override model retrieval for dual routing.
   *
   * Codex models use sdk.responses() (completion API).
   * Other models use sdk.chat() (conversational API).
   */
  override getModel(
    sdk: ProviderSDK,
    modelID: string,
    _options?: ModelOptions
  ): LanguageModelV2 {
    if (modelID.includes("codex")) {
      if (typeof sdk.responses === "function") {
        return sdk.responses(modelID)
      }
    }

    if (typeof sdk.chat === "function") {
      return sdk.chat(modelID)
    }

    return super.getModel(sdk, modelID, _options)
  }

  /**
   * Wrap options in OpenAI namespace (GitHub Copilot is OpenAI-compatible).
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
      reasoning: "none",
      modalities: { input: ["text"], output: ["text"] },
      authentication: ["oauth"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Transform error messages with helpful GitHub Copilot links.
   */
  override transformError(error: APICallError): string {
    let message = error.message

    if (message.includes("The requested model is not supported")) {
      return (
        message +
        "\n\nMake sure the model is enabled in your copilot settings: https://github.com/settings/copilot/features"
      )
    }

    return message
  }
}

/**
 * GitHub Copilot Enterprise provider.
 *
 * Identical to standard GitHub Copilot but with separate auth credentials.
 */
export class GitHubCopilotEnterpriseProvider extends GitHubCopilotProvider {
  override readonly id: string = "github-copilot-enterprise"
  override readonly name: string = "GitHub Copilot Enterprise"

  /**
   * Resolve credentials from enterprise-specific auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Check enterprise auth store
    const stored = await ctx.authStore.get("github-copilot-enterprise")
    if (stored?.apiKey) return { apiKey: stored.apiKey }
    if (stored?.accessToken) return { bearerToken: stored.accessToken }

    // Fall back to standard copilot auth
    const standardStored = await ctx.authStore.get("github-copilot")
    if (standardStored?.apiKey) return { apiKey: standardStored.apiKey }
    if (standardStored?.accessToken) return { bearerToken: standardStored.accessToken }

    // Check for OAuth plugin
    const plugin = ctx.plugins.find(
      (p) => p.id === "opencode-copilot-auth" && p.auth?.loader
    )
    if (plugin?.auth?.loader) {
      return plugin.auth.loader(ctx)
    }

    return null
  }
}
