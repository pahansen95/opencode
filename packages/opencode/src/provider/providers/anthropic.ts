/**
 * Anthropic Provider Implementation
 *
 * Integrates Claude models with extended thinking, ephemeral prompt caching,
 * and tool ID sanitization for Anthropic API compatibility.
 *
 * @module provider/providers/anthropic
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  OptionsContext,
  HeaderContext,
  ListModelsContext,
  Model,
  ModelMessage,
  VariantConfig,
  APICallError,
} from "../protocol"

/**
 * Anthropic provider for Claude models.
 *
 * Key behaviors:
 * - Empty message filtering (Anthropic rejects empty content)
 * - Tool ID sanitization: /[^a-zA-Z0-9_-]/g replaced with "_"
 * - Cache markers applied to first 2 system + last 2 non-system messages
 * - Beta headers for extended thinking and tool streaming
 * - Budget-based reasoning variants (high: 16k, max: 32k tokens)
 */
export class AnthropicProvider extends BaseProvider {
  override readonly id = "anthropic"
  override readonly sdk = "@ai-sdk/anthropic"
  override readonly name = "Anthropic"
  override readonly url = "https://anthropic.com"

  /**
   * Resolve credentials from env, auth store, or OAuth plugin.
   *
   * Resolution order:
   * 1. ANTHROPIC_API_KEY environment variable
   * 2. Stored credentials from auth store
   * 3. OAuth plugin (opencode-anthropic-auth)
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // 1. Environment variable
    const apiKey = ctx.env.ANTHROPIC_API_KEY
    if (apiKey) return { apiKey }

    // 2. Auth store
    const stored = await ctx.authStore.get("anthropic")
    if (stored?.apiKey) return { apiKey: stored.apiKey }

    // 3. OAuth plugin
    const plugin = ctx.plugins.find(
      (p) => p.id === "opencode-anthropic-auth" && p.auth?.loader
    )
    if (plugin?.auth?.loader) {
      return plugin.auth.loader(ctx)
    }

    return null
  }

  /**
   * Models are fetched from models.dev, not enumerated here.
   */
  override async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  /**
   * Normalize messages for Anthropic API requirements.
   *
   * 1. Filter out messages with empty content
   * 2. Remove empty text/reasoning parts from array content
   * 3. Sanitize tool call IDs to alphanumeric + underscore + hyphen
   */
  override normalizeMessages(messages: ModelMessage[], _model: Model): ModelMessage[] {
    return messages
      .map((msg) => this.filterEmptyContent(msg))
      .filter((msg): msg is ModelMessage => msg !== null)
      .map((msg) => this.sanitizeToolIds(msg))
  }

  /**
   * Filter empty content from message.
   * Returns null if message has no content.
   */
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

  /**
   * Sanitize tool call IDs to comply with Anthropic's requirements.
   * Pattern: Only alphanumeric, underscore, and hyphen allowed.
   */
  private sanitizeToolIds(msg: ModelMessage): ModelMessage {
    return this.mapToolCallIds(msg, (id) =>
      id.replace(/[^a-zA-Z0-9_-]/g, "_")
    )
  }

  /**
   * Build options with caching enabled for Anthropic.
   */
  override buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    // Apply caching configuration
    if (this.supportsCaching() && ctx.sessionID) {
      options.caching = { enabled: true, type: "ephemeral" }
    }

    return options
  }

  /**
   * Wrap options in Anthropic namespace for AI SDK.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { anthropic: options }
  }

  /**
   * Declare Anthropic capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: true,
      reasoning: "budget",
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
      authentication: ["api_key", "oauth"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get reasoning variants for extended thinking.
   *
   * Anthropic uses budget-based thinking allocation:
   * - high: 16,000 tokens for thinking
   * - max: 31,999 tokens for thinking
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    return [
      {
        name: "high",
        label: "Extended Thinking",
        description: "Allocate 16k tokens for thinking",
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
        description: "Allocate maximum tokens for thinking",
        options: {
          thinking: {
            type: "enabled",
            budgetTokens: 31999,
          },
        },
      },
    ]
  }

  /**
   * Apply ephemeral cache markers to messages.
   *
   * Marks first 2 system messages and last 2 non-system messages
   * for prompt caching to reduce latency and cost.
   */
  override applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    return this.applyCacheMarkers(messages, {
      systemCount: 2,
      tailCount: 2,
      cacheControl: { type: "ephemeral" },
    })
  }

  /**
   * Get Anthropic beta headers for advanced features.
   *
   * Enabled betas:
   * - claude-code-20250219: Enhanced code understanding
   * - interleaved-thinking-2025-05-14: Extended thinking with interleaved output
   * - fine-grained-tool-streaming-2025-05-14: Granular tool streaming
   */
  override getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {
      "anthropic-beta":
        "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
    }
  }

  /**
   * Transform error messages with helpful context.
   */
  override transformError(error: APICallError): string {
    return error.message
  }
}
