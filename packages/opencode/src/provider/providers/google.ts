/**
 * Google Generative AI Provider Implementation
 *
 * Integrates Gemini models with thinkingConfig support, schema sanitization
 * for Gemini compatibility, and configurable thinking budgets.
 *
 * @module provider/providers/google
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderDefaults,
  ProviderOptions,
  NamespacedOptions,
  OptionsContext,
  ListModelsContext,
  Model,
  VariantConfig,
} from "../protocol"
import type { JSONSchema7 } from "@ai-sdk/provider"

/**
 * Google Generative AI provider for Gemini models.
 *
 * Key behaviors:
 * - thinkingConfig with includeThoughts and thinkingBudget (Gemini 2.5)
 * - thinkingLevel effort (Gemini 3+)
 * - Schema sanitization: integer enums converted to string enums
 * - Default temperature 1.0, topP 0.95, topK 64
 */
export class GoogleProvider extends BaseProvider {
  override readonly id = "google"
  override readonly sdk = "@ai-sdk/google"
  override readonly name = "Google"
  override readonly url = "https://ai.google.dev"

  /**
   * Resolve credentials from env or auth store.
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // Check multiple environment variables
    const apiKey =
      ctx.env.GOOGLE_GENERATIVE_AI_API_KEY ?? ctx.env.GEMINI_API_KEY

    if (apiKey) return { apiKey }

    // Auth store
    const stored = await ctx.authStore.get("google")
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
   * Build options with thinkingConfig.
   */
  override buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    // Add thinkingConfig for reasoning models
    if (ctx.model.capabilities.reasoning) {
      options.thinkingConfig = {
        includeThoughts: true,
      }

      // Set default thinkingLevel for Gemini 3 models
      if (ctx.model.id.includes("gemini-3")) {
        ;(options.thinkingConfig as any).thinkingLevel = "high"
      }
    }

    return options
  }

  /**
   * Build options for small/fast models.
   */
  override buildSmallModelOptions(_model: Model): ProviderOptions {
    return { thinkingConfig: { thinkingBudget: 0 } }
  }

  /**
   * Wrap options in Google namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { google: options }
  }

  /**
   * Declare Google capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: false,
      reasoning: "budget",
      modalities: { input: ["text", "image", "audio", "video"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get default parameters for Gemini.
   */
  override defaults(): ProviderDefaults {
    return {
      temperature: 1.0,
      topP: 0.95,
      topK: 64,
    }
  }

  /**
   * Get reasoning variants for Gemini models.
   *
   * Gemini 2.5: thinkingBudget-based (16k, 24k tokens)
   * Gemini 3+: thinkingLevel-based (low, high)
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const id = model.id.toLowerCase()

    // Gemini 2.5 uses thinkingBudget
    if (id.includes("2.5")) {
      return [
        {
          name: "high",
          label: "Extended Thinking",
          options: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 16000,
            },
          },
        },
        {
          name: "max",
          label: "Maximum Thinking",
          options: {
            thinkingConfig: {
              includeThoughts: true,
              thinkingBudget: 24576,
            },
          },
        },
      ]
    }

    // Gemini 3+ uses thinkingLevel
    return [
      {
        name: "low",
        label: "Low Thinking",
        options: {
          includeThoughts: true,
          thinkingLevel: "low",
        },
      },
      {
        name: "high",
        label: "High Thinking",
        options: {
          includeThoughts: true,
          thinkingLevel: "high",
        },
      },
    ]
  }

  /**
   * Transform schema for Gemini compatibility.
   *
   * Gemini requires:
   * - All enum values as strings (not integers)
   * - Type changed from integer/number to string for enum fields
   * - Required array filtered to only existing properties
   * - Array items must not be null
   */
  override transformSchema(schema: JSONSchema7, model: Model): JSONSchema7 {
    const id = model.id.toLowerCase()
    if (!id.includes("gemini") && model.providerID !== "google") {
      return schema
    }

    return this.sanitizeGeminiSchema(schema)
  }

  /**
   * Recursively sanitize schema for Gemini.
   */
  private sanitizeGeminiSchema(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeGeminiSchema(item))
    }

    const result: any = {}

    for (const [key, value] of Object.entries(obj)) {
      if (key === "enum" && Array.isArray(value)) {
        // Convert all enum values to strings
        result[key] = value.map((v) => String(v))
        // Change type if integer/number with enum
        if (result.type === "integer" || result.type === "number") {
          result.type = "string"
        }
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.sanitizeGeminiSchema(value)
      } else {
        result[key] = value
      }
    }

    // Filter required array to only include existing properties
    if (
      result.type === "object" &&
      result.properties &&
      Array.isArray(result.required)
    ) {
      result.required = result.required.filter(
        (field: string) => field in result.properties
      )
    }

    // Ensure array items are not null
    if (result.type === "array" && result.items == null) {
      result.items = {}
    }

    return result
  }
}
