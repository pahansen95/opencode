/**
 * Google Vertex AI Provider Implementation
 *
 * Integrates Gemini models via Google Cloud Vertex AI with Application
 * Default Credentials (ADC) authentication.
 *
 * @module provider/providers/google-vertex
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderDefaults,
  ProviderOptions,
  NamespacedOptions,
  SDKOptions,
  OptionsContext,
  ListModelsContext,
  Model,
  VariantConfig,
  ProviderSDK,
  EnvironmentVariables,
} from "../protocol"
import type { JSONSchema7 } from "@ai-sdk/provider"

/**
 * Google Vertex AI provider for Gemini models.
 *
 * Key behaviors:
 * - Application Default Credentials (ADC) authentication
 * - Project and location configuration from env
 * - Same thinkingConfig and schema sanitization as Google provider
 */
export class GoogleVertexProvider extends BaseProvider {
  override readonly id = "google-vertex"
  override readonly sdk = "@ai-sdk/google-vertex"
  override readonly name = "Google Vertex AI"
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
   * Uses Application Default Credentials (ADC).
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
      "us-east5"

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
    const sdkModule = await import(this.sdk)
    const factory = sdkModule.createVertex ?? sdkModule.default

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
   * Build options with thinkingConfig.
   */
  override buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    if (ctx.model.capabilities.reasoning) {
      options.thinkingConfig = {
        includeThoughts: true,
      }

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
   * Declare capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: false,
      reasoning: "budget",
      modalities: { input: ["text", "image", "audio", "video", "pdf"], output: ["text"] },
      authentication: ["adc"],
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
   * Get reasoning variants (same as Google provider).
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    const id = model.id.toLowerCase()

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
   * Transform schema for Gemini compatibility (same as Google).
   */
  override transformSchema(schema: JSONSchema7, model: Model): JSONSchema7 {
    const id = model.id.toLowerCase()
    if (!id.includes("gemini")) {
      return schema
    }

    return this.sanitizeGeminiSchema(schema)
  }

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
        result[key] = value.map((v) => String(v))
        if (result.type === "integer" || result.type === "number") {
          result.type = "string"
        }
      } else if (typeof value === "object" && value !== null) {
        result[key] = this.sanitizeGeminiSchema(value)
      } else {
        result[key] = value
      }
    }

    if (
      result.type === "object" &&
      result.properties &&
      Array.isArray(result.required)
    ) {
      result.required = result.required.filter(
        (field: string) => field in result.properties
      )
    }

    if (result.type === "array" && result.items == null) {
      result.items = {}
    }

    return result
  }
}
