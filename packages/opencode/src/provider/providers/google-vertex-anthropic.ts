/**
 * Google Vertex Anthropic Provider Implementation
 *
 * Integrates Claude models via Google Cloud Vertex AI with ADC authentication.
 *
 * @module provider/providers/google-vertex-anthropic
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
  ModelMessage,
  VariantConfig,
  ProviderSDK,
  EnvironmentVariables,
} from "../protocol"

/**
 * Google Vertex Anthropic provider for Claude models on Vertex AI.
 *
 * Key behaviors:
 * - Uses @ai-sdk/google-vertex/anthropic subpath import
 * - ADC authentication with project and location
 * - Same message normalization as Anthropic provider
 * - Budget-based reasoning variants
 */
export class GoogleVertexAnthropicProvider extends BaseProvider {
  override readonly id = "google-vertex-anthropic"
  override readonly sdk = "@ai-sdk/google-vertex/anthropic"
  override readonly name = "Google Vertex (Anthropic)"
  override readonly url = "https://cloud.google.com/vertex-ai"

  /**
   * Check if provider should auto-load based on GCP project.
   */
  override autoload(env: EnvironmentVariables): boolean {
    return !!(
      env.GOOGLE_CLOUD_PROJECT ??
      env.GCP_PROJECT ??
      env.GCLOUD_PROJECT
    )
  }

  /**
   * Resolve credentials from GCP project configuration.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    const project =
      ctx.env.GOOGLE_CLOUD_PROJECT ??
      ctx.env.GCP_PROJECT ??
      ctx.env.GCLOUD_PROJECT

    if (!project) return null

    const location =
      ctx.env.GOOGLE_CLOUD_LOCATION ??
      ctx.env.VERTEX_LOCATION ??
      "global"

    return {
      google: {
        projectId: project,
        location,
        useADC: true,
      },
    }
  }

  /**
   * Initialize SDK with project and location.
   */
  override async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    // Use subpath import for anthropic models
    const sdkModule = await import("@ai-sdk/google-vertex/anthropic")
    const factory = (sdkModule as any).createVertexAnthropic ?? (sdkModule as any).default

    return factory({
      project: credentials.google?.projectId,
      location: credentials.google?.location,
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
   * Normalize messages (same as Anthropic).
   */
  override normalizeMessages(messages: ModelMessage[], _model: Model): ModelMessage[] {
    return messages
      .map((msg) => this.filterEmptyContent(msg))
      .filter((msg): msg is ModelMessage => msg !== null)
      .map((msg) => this.sanitizeToolIds(msg))
  }

  private filterEmptyContent(msg: ModelMessage): ModelMessage | null {
    if (typeof msg.content === "string") {
      return msg.content.length > 0 ? msg : null
    }

    if (!Array.isArray(msg.content)) {
      return msg
    }

    const filtered = msg.content.filter((part) => {
      if (part.type === "text") return part.text.length > 0
      if (part.type === "reasoning") return part.reasoning.length > 0
      return true
    })

    if (filtered.length === 0) return null
    return { ...msg, content: filtered }
  }

  private sanitizeToolIds(msg: ModelMessage): ModelMessage {
    return this.mapToolCallIds(msg, (id) =>
      id.replace(/[^a-zA-Z0-9_-]/g, "_")
    )
  }

  /**
   * Apply caching (same as Anthropic).
   */
  override applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    return this.applyCacheMarkers(messages, {
      systemCount: 2,
      tailCount: 2,
      cacheControl: { type: "ephemeral" },
    })
  }

  /**
   * Wrap options in Anthropic namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { anthropic: options }
  }

  /**
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: true,
      reasoning: "budget",
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
      authentication: ["adc"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get reasoning variants (same as Anthropic).
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    return [
      {
        name: "high",
        label: "Extended Thinking",
        options: {
          thinking: {
            type: "enabled",
            budgetTokens: 16000,
          },
        },
      },
      {
        name: "max",
        label: "Maximum Thinking",
        options: {
          thinking: {
            type: "enabled",
            budgetTokens: 31999,
          },
        },
      },
    ]
  }
}
