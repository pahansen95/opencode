/**
 * Mistral Provider Implementation
 *
 * Integrates Mistral models with strict tool call ID formatting
 * and message sequence validation requirements.
 *
 * @module provider/providers/mistral
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
  ModelMessage,
} from "../protocol"

/**
 * Mistral provider for Mistral AI models.
 *
 * Key behaviors:
 * - Tool call ID normalization to exactly 9 alphanumeric characters
 * - Message sequence fix: insert assistant "Done." between tool->user messages
 * - No reasoning variants (not supported)
 * - No caching support
 */
export class MistralProvider extends BaseProvider {
  override readonly id = "mistral"
  override readonly sdk = "@ai-sdk/mistral"
  override readonly name = "Mistral"
  override readonly url = "https://mistral.ai"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Environment variable
    const apiKey = ctx.env.MISTRAL_API_KEY
    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("mistral")
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
   * Normalize messages for Mistral API requirements.
   *
   * 1. Normalize tool call IDs to exactly 9 alphanumeric characters
   * 2. Fix tool->user message sequences by inserting assistant message
   */
  override normalizeMessages(messages: ModelMessage[], _model: Model): ModelMessage[] {
    // First, normalize tool call IDs
    let normalized = messages.map((msg) => this.normalizeToolCallIds(msg))

    // Then, fix message sequences
    normalized = this.fixToolUserSequence(normalized)

    return normalized
  }

  /**
   * Normalize tool call IDs to Mistral's requirements.
   *
   * Mistral requires tool call IDs to be exactly 9 alphanumeric characters.
   * - Remove all non-alphanumeric characters
   * - Take first 9 characters
   * - Pad with zeros if less than 9
   */
  private normalizeToolCallIds(msg: ModelMessage): ModelMessage {
    return this.mapToolCallIds(msg, (id) => {
      const alphanumeric = id.replace(/[^a-zA-Z0-9]/g, "")
      if (alphanumeric.length >= 9) {
        return alphanumeric.slice(0, 9)
      }
      return alphanumeric.padEnd(9, "0")
    })
  }

  /**
   * Fix invalid tool->user message sequences.
   *
   * Mistral API requires that tool messages cannot be directly followed
   * by user messages. Insert an assistant message with "Done." to fix.
   */
  private fixToolUserSequence(messages: ModelMessage[]): ModelMessage[] {
    const result: ModelMessage[] = []

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i]
      const prev = result[result.length - 1]

      // If previous was tool and current is user, insert assistant
      if (prev?.role === "tool" && current.role === "user") {
        result.push({
          role: "assistant",
          content: [{ type: "text", text: "Done." }],
        })
      }

      result.push(current)
    }

    return result
  }

  /**
   * Wrap options in Mistral namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { mistral: options }
  }

  /**
   * Declare Mistral capabilities.
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

  /**
   * No reasoning variants for Mistral.
   */
  override variants(_model: Model): [] {
    return []
  }
}
