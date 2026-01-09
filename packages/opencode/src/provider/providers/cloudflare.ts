/**
 * Cloudflare AI Gateway Provider Implementation
 *
 * Integrates Cloudflare AI Gateway with unified billing and custom fetch
 * to strip Authorization headers.
 *
 * @module provider/providers/cloudflare
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  SDKOptions,
  HeaderContext,
  ListModelsContext,
  Model,
  ProviderSDK,
  EnvironmentVariables,
} from "../protocol"

/**
 * Cloudflare AI Gateway provider.
 *
 * Key behaviors:
 * - Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_GATEWAY_ID
 * - Uses cf-aig-authorization header for unified billing
 * - Custom fetch to strip Authorization header
 * - OpenAI-compatible endpoint
 */
export class CloudflareAIGatewayProvider extends BaseProvider {
  override readonly id = "cloudflare-ai-gateway"
  override readonly sdk = "@ai-sdk/openai-compatible"
  override readonly name = "Cloudflare AI Gateway"
  override readonly url = "https://developers.cloudflare.com/ai-gateway"

  /**
   * Check if provider should auto-load based on account/gateway IDs.
   */
  override autoload(env: EnvironmentVariables): boolean {
    return !!(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_GATEWAY_ID)
  }

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    const accountId = ctx.env.CLOUDFLARE_ACCOUNT_ID
    const gatewayId = ctx.env.CLOUDFLARE_GATEWAY_ID

    if (!accountId || !gatewayId) return null

    // Get API token for unified billing
    const apiToken =
      ctx.env.CLOUDFLARE_API_TOKEN ??
      (await ctx.authStore.get("cloudflare-ai-gateway"))?.apiKey

    return {
      custom: {
        accountId,
        gatewayId,
        apiToken,
      },
    }
  }

  /**
   * Initialize SDK with gateway URL and custom fetch.
   */
  override async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    const sdkModule = await import(this.sdk)
    const factory = this.getSDKFactory(sdkModule)

    const { accountId, gatewayId, apiToken } = credentials.custom ?? {}
    const baseURL = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`

    // Build headers
    const headers: Record<string, string> = {
      "HTTP-Referer": "https://opencode.ai/",
      "X-Title": "opencode",
    }

    // Add unified billing header if token exists
    if (apiToken) {
      headers["cf-aig-authorization"] = `Bearer ${apiToken}`
    }

    // Custom fetch that strips Authorization header
    const customFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const newHeaders = new Headers(init?.headers)
      newHeaders.delete("Authorization")
      return fetch(input, { ...init, headers: newHeaders })
    }

    return factory({
      baseURL,
      headers,
      fetch: customFetch,
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
   * Get custom headers.
   */
  override getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {
      "HTTP-Referer": "https://opencode.ai/",
      "X-Title": "opencode",
    }
  }

  /**
   * Wrap options in OpenAI namespace (OpenAI-compatible API).
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
      modalities: { input: ["text", "image"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }
}
