/**
 * Provider Registration
 *
 * Central registration point for all bundled providers.
 * Exports individual provider classes and registration function.
 *
 * @module provider/providers
 */

import type { IProviderRegistry } from "../protocol"

// Priority providers (complex implementations)
import { AnthropicProvider } from "./anthropic"
import { OpenAIProvider } from "./openai"
import { AmazonBedrockProvider } from "./amazon-bedrock"
import { GoogleProvider } from "./google"
import { MistralProvider } from "./mistral"

// Standard providers
import { AzureProvider } from "./azure"
import { AzureCognitiveProvider } from "./azure-cognitive"
import { GoogleVertexProvider } from "./google-vertex"
import { GoogleVertexAnthropicProvider } from "./google-vertex-anthropic"
import { GitHubCopilotProvider, GitHubCopilotEnterpriseProvider } from "./github-copilot"
import { OpenRouterProvider } from "./openrouter"
import { GroqProvider } from "./groq"
import { CerebrasProvider } from "./cerebras"
import { CloudflareAIGatewayProvider } from "./cloudflare"
import { XAIProvider } from "./xai"
import { DeepInfraProvider } from "./deepinfra"
import { CohereProvider } from "./cohere"
import { OpenCodeProvider } from "./opencode"
import { SapAiCoreProvider } from "./sap-ai-core"
import { ZenmuxProvider } from "./zenmux"
import { VercelProvider } from "./vercel"
import { TogetherAIProvider } from "./togetherai"
import { PerplexityProvider } from "./perplexity"
import { GatewayProvider } from "./gateway"

// Re-export all provider classes
export {
  // Priority providers
  AnthropicProvider,
  OpenAIProvider,
  AmazonBedrockProvider,
  GoogleProvider,
  MistralProvider,
  // Standard providers
  AzureProvider,
  AzureCognitiveProvider,
  GoogleVertexProvider,
  GoogleVertexAnthropicProvider,
  GitHubCopilotProvider,
  GitHubCopilotEnterpriseProvider,
  OpenRouterProvider,
  GroqProvider,
  CerebrasProvider,
  CloudflareAIGatewayProvider,
  XAIProvider,
  DeepInfraProvider,
  CohereProvider,
  OpenCodeProvider,
  // Additional providers
  SapAiCoreProvider,
  ZenmuxProvider,
  VercelProvider,
  TogetherAIProvider,
  PerplexityProvider,
  GatewayProvider,
}

/**
 * Register all bundled providers with the registry.
 *
 * Providers are registered in priority order:
 * 1. Primary cloud providers (Anthropic, OpenAI, Google)
 * 2. AWS/Azure managed providers
 * 3. Gateway/router providers
 * 4. Specialized providers
 * 5. Internal provider
 *
 * @param registry - Provider registry to register providers with
 */
export function registerBundledProviders(registry: IProviderRegistry): void {
  // Primary cloud providers
  registry.register(new AnthropicProvider())
  registry.register(new OpenAIProvider())
  registry.register(new GoogleProvider())
  registry.register(new GoogleVertexProvider())
  registry.register(new GoogleVertexAnthropicProvider())

  // AWS/Azure managed providers
  registry.register(new AmazonBedrockProvider())
  registry.register(new AzureProvider())
  registry.register(new AzureCognitiveProvider())

  // Gateway/router providers
  registry.register(new OpenRouterProvider())
  registry.register(new CloudflareAIGatewayProvider())

  // GitHub Copilot
  registry.register(new GitHubCopilotProvider())
  registry.register(new GitHubCopilotEnterpriseProvider())

  // Other providers
  registry.register(new MistralProvider())
  registry.register(new GroqProvider())
  registry.register(new CerebrasProvider())
  registry.register(new XAIProvider())
  registry.register(new DeepInfraProvider())
  registry.register(new CohereProvider())

  // Additional providers
  registry.register(new SapAiCoreProvider())
  registry.register(new ZenmuxProvider())
  registry.register(new VercelProvider())
  registry.register(new TogetherAIProvider())
  registry.register(new PerplexityProvider())
  registry.register(new GatewayProvider())

  // Internal provider (last)
  registry.register(new OpenCodeProvider())
}

/**
 * Get list of all bundled provider IDs.
 * Useful for configuration validation and UI.
 *
 * @returns Array of bundled provider identifiers
 */
export function getBundledProviderIDs(): string[] {
  return [
    "anthropic",
    "openai",
    "google",
    "google-vertex",
    "google-vertex-anthropic",
    "amazon-bedrock",
    "azure",
    "azure-cognitive-services",
    "openrouter",
    "cloudflare-ai-gateway",
    "github-copilot",
    "github-copilot-enterprise",
    "mistral",
    "groq",
    "cerebras",
    "xai",
    "deepinfra",
    "cohere",
    "sap-ai-core",
    "zenmux",
    "vercel",
    "togetherai",
    "perplexity",
    "gateway",
    "opencode",
  ]
}
