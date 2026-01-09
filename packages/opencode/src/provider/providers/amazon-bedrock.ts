/**
 * Amazon Bedrock Provider Implementation
 *
 * Integrates AWS Bedrock models with sophisticated region-aware model ID prefixing,
 * AWS credential chain support, and cross-region inference handling.
 *
 * @module provider/providers/amazon-bedrock
 */

import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  ProviderSDK,
  SDKOptions,
  ListModelsContext,
  Model,
  ModelMessage,
  VariantConfig,
  ModelOptions,
  EnvironmentVariables,
} from "../protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"

/**
 * Region prefix mapping for cross-region inference.
 */
const REGION_PREFIXES: Record<string, string> = {
  "us-east-1": "us.",
  "us-west-2": "us.",
  "eu-west-1": "eu.",
  "eu-west-3": "eu.",
  "ap-northeast-1": "jp.",
  "ap-southeast-2": "au.",
  "ap-south-1": "apac.",
}

/**
 * Amazon Bedrock provider for AWS-hosted foundation models.
 *
 * Key behaviors:
 * - AWS credential chain support (env, profile, IAM roles, SSO)
 * - Bearer token authentication for CI/CD scenarios
 * - Region-aware model ID prefixing for cross-region inference
 * - cachePoint markers instead of cacheControl
 * - Effort-based reasoning variants
 */
export class AmazonBedrockProvider extends BaseProvider {
  override readonly id = "amazon-bedrock"
  override readonly sdk = "@ai-sdk/amazon-bedrock"
  override readonly name = "Amazon Bedrock"
  override readonly url = "https://aws.amazon.com/bedrock"

  /**
   * Check if provider should auto-load based on AWS credentials.
   */
  override autoload(env: EnvironmentVariables): boolean {
    return !!(
      env.AWS_ACCESS_KEY_ID ||
      env.AWS_PROFILE ||
      env.AWS_BEARER_TOKEN_BEDROCK
    )
  }

  /**
   * Resolve AWS credentials from env, profile, or bearer token.
   *
   * Credential resolution order:
   * 1. Bearer token (AWS_BEARER_TOKEN_BEDROCK)
   * 2. AWS credential chain (AWS_ACCESS_KEY_ID, AWS_PROFILE)
   */
  override async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    const region =
      ctx.env.AWS_REGION ?? ctx.env.AWS_DEFAULT_REGION ?? "us-east-1"

    // Bearer token path (for CI/CD with temporary tokens)
    if (ctx.env.AWS_BEARER_TOKEN_BEDROCK) {
      return {
        aws: {
          accessKeyId: "",
          secretAccessKey: "",
          region,
        },
        custom: {
          bedrockOptions: {
            region,
            headers: {
              Authorization: `Bearer ${ctx.env.AWS_BEARER_TOKEN_BEDROCK}`,
            },
          },
        },
      }
    }

    // Check auth store for bearer token
    const stored = await ctx.authStore.get("amazon-bedrock")
    if (stored?.apiKey) {
      return {
        aws: {
          accessKeyId: "",
          secretAccessKey: "",
          region,
        },
        custom: {
          bedrockOptions: {
            region,
            headers: {
              Authorization: `Bearer ${stored.apiKey}`,
            },
          },
        },
      }
    }

    // Standard credential chain
    if (ctx.env.AWS_ACCESS_KEY_ID || ctx.env.AWS_PROFILE) {
      return {
        aws: {
          accessKeyId: ctx.env.AWS_ACCESS_KEY_ID ?? "",
          secretAccessKey: ctx.env.AWS_SECRET_ACCESS_KEY ?? "",
          sessionToken: ctx.env.AWS_SESSION_TOKEN,
          region,
        },
      }
    }

    return null
  }

  /**
   * Initialize SDK with AWS credential provider chain.
   */
  override async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    const sdkModule = await import(this.sdk)

    const bedrockOptions = (credentials.custom?.bedrockOptions ?? {}) as Record<string, unknown>
    const region = credentials.aws?.region ?? "us-east-1"

    // Get profile from config if specified
    const profile = (options as any).profile

    // Try to dynamically import AWS credential providers
    let credentialProvider: unknown = undefined
    try {
      // @ts-expect-error - dynamic import, may not be installed
      const credProviders = await import("@aws-sdk/credential-providers")
      credentialProvider = credProviders.fromNodeProviderChain(
        profile ? { profile } : undefined
      )
    } catch {
      // AWS SDK not installed, will use default credentials
    }

    const sdkOptions = {
      region,
      ...(credentialProvider ? { credentialProvider } : {}),
      ...bedrockOptions,
      ...options,
    }

    return sdkModule.createAmazonBedrock(sdkOptions)
  }

  /**
   * Get model with region-aware ID prefixing for cross-region inference.
   */
  override getModel(
    sdk: ProviderSDK,
    modelID: string,
    options?: ModelOptions
  ): LanguageModelV2 {
    const prefixedID = this.addRegionPrefix(modelID, options)
    return super.getModel(sdk, prefixedID, options)
  }

  /**
   * Add region prefix for cross-region inference.
   *
   * Prefix rules by region:
   * - US regions: us. prefix for claude, nova, deepseek models
   * - EU regions: eu. prefix for claude, nova, llama3, pixtral models
   * - Tokyo (ap-northeast-1): jp. prefix
   * - Australia (ap-southeast-2/4): au. prefix for specific claude models
   * - Other APAC: apac. prefix
   */
  private addRegionPrefix(
    modelID: string,
    options?: ModelOptions
  ): string {
    // Skip if already has cross-region prefix
    if (modelID.startsWith("global.") || modelID.startsWith("jp.")) {
      return modelID
    }

    // Skip for existing prefixes
    if (
      Object.values(REGION_PREFIXES).some((p) => modelID.startsWith(p))
    ) {
      return modelID
    }

    const region =
      (options as any)?.region ?? process.env.AWS_REGION ?? "us-east-1"
    const regionPrefix = region.split("-")[0]

    switch (regionPrefix) {
      case "us": {
        const modelRequiresPrefix = [
          "nova-micro",
          "nova-lite",
          "nova-pro",
          "nova-premier",
          "claude",
          "deepseek",
        ].some((m) => modelID.includes(m))
        const isGovCloud = region.startsWith("us-gov")
        if (modelRequiresPrefix && !isGovCloud) {
          return `us.${modelID}`
        }
        break
      }

      case "eu": {
        const euRegions = [
          "eu-west-1",
          "eu-west-2",
          "eu-west-3",
          "eu-north-1",
          "eu-central-1",
          "eu-south-1",
          "eu-south-2",
        ]
        const regionRequiresPrefix = euRegions.some((r) => region.includes(r))
        const modelRequiresPrefix = [
          "claude",
          "nova-lite",
          "nova-micro",
          "llama3",
          "pixtral",
        ].some((m) => modelID.includes(m))
        if (regionRequiresPrefix && modelRequiresPrefix) {
          return `eu.${modelID}`
        }
        break
      }

      case "ap": {
        const isAustraliaRegion = [
          "ap-southeast-2",
          "ap-southeast-4",
        ].includes(region)
        const isTokyoRegion = region === "ap-northeast-1"

        if (isAustraliaRegion) {
          const auModels = ["anthropic.claude-sonnet-4-5", "anthropic.claude-haiku"]
          if (auModels.some((m) => modelID.includes(m))) {
            return `au.${modelID}`
          }
        } else if (isTokyoRegion) {
          const jpModels = ["claude", "nova-lite", "nova-micro", "nova-pro"]
          if (jpModels.some((m) => modelID.includes(m))) {
            return `jp.${modelID}`
          }
        } else {
          // Other APAC regions
          const apacModels = ["claude", "nova-lite", "nova-micro", "nova-pro"]
          if (apacModels.some((m) => modelID.includes(m))) {
            return `apac.${modelID}`
          }
        }
        break
      }
    }

    return modelID
  }

  /**
   * Models are fetched from models.dev.
   */
  override async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  /**
   * Apply caching with Bedrock-specific cachePoint markers.
   */
  override applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    // Bedrock uses cachePoint instead of cacheControl
    const result = [...messages]
    const system = result.filter((msg) => msg.role === "system").slice(0, 2)
    const final = result.filter((msg) => msg.role !== "system").slice(-2)

    const cacheOptions = {
      bedrock: {
        cachePoint: { type: "ephemeral" },
      },
    }

    for (const msg of [...system, ...final]) {
      if (Array.isArray(msg.content) && msg.content.length > 0) {
        const lastContent = msg.content[msg.content.length - 1]
        if (lastContent && typeof lastContent === "object") {
          ;(lastContent as any).providerOptions = {
            ...(lastContent as any).providerOptions,
            ...cacheOptions,
          }
          continue
        }
      }
      ;(msg as any).providerOptions = {
        ...(msg as any).providerOptions,
        ...cacheOptions,
      }
    }

    return result
  }

  /**
   * Wrap options in Bedrock namespace.
   */
  override wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { bedrock: options }
  }

  /**
   * Declare Bedrock capabilities.
   */
  override capabilities(): ProviderCapabilities {
    return {
      caching: true,
      reasoning: "effort",
      modalities: { input: ["text", "image"], output: ["text"] },
      authentication: ["aws_chain"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  /**
   * Get reasoning variants with effort levels.
   */
  override variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []

    return ["low", "medium", "high"].map((effort) => ({
      name: effort,
      label: `${effort.charAt(0).toUpperCase()}${effort.slice(1)} Reasoning`,
      options: {
        reasoningConfig: {
          type: "enabled",
          maxReasoningEffort: effort,
        },
      },
    }))
  }
}
