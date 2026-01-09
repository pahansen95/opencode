/**
 * Provider Module - New Protocol Architecture
 *
 * Public exports for the provider protocol system.
 * This module provides:
 * - Type definitions for provider implementations
 * - Error classes for provider operations
 * - Base class for building providers
 * - Singleton accessors for registries and router
 *
 * @module provider
 */

// =============================================================================
// Protocol Types
// =============================================================================

export type {
  // Core protocol
  ProviderProtocol,
  ProviderCapabilities,
  ProviderDefaults,
  ProviderOptions,
  NamespacedOptions,
  ProviderSDK,
  ProviderConfig,

  // Authentication
  AuthContext,
  AuthStore,
  Credentials,
  StoredCredentials,
  AWSCredentials,
  GoogleCredentials,
  AuthMethod,
  AuthenticationType,
  Plugin,
  PluginAuth,

  // Models
  Model,
  ModelCapabilities,
  ModelModalities,
  ModelLimits,
  ModelCost,
  ModelAPIConfig,
  ModelStatus,
  ModelReference,
  ModelOptions,
  Modality,

  // Messages
  ModelMessage,
  ContentPart,
  TextPart,
  ImagePart,
  AudioPart,
  VideoPart,
  FilePart,
  ToolCallPart,
  ToolResultPart,
  ReasoningPart,
  ToolCall,
  MessageRole,
  MessageMetadata,
  CacheControl,

  // Options
  OptionsContext,
  SDKOptions,
  HeaderContext,
  AgentConfig,
  ReasoningConfig,
  ReasoningEffort,
  CachingConfig,

  // Capabilities
  ReasoningSupport,
  ProviderModalities,
  RateLimits,
  VariantConfig,

  // Routing
  RouteContext,
  TaskType,
  ComplexityEstimate,
  SessionMetadata,
  RoutePreferences,
  RoutingStrategy,

  // Registry interfaces
  IProviderRegistry,
  IProviderRouter,
  IModelRegistry,
  ProviderInfo,
  ListModelsContext,

  // Errors
  APICallError,
  EnvironmentVariables,
} from "./protocol"

// =============================================================================
// Error Classes
// =============================================================================

export {
  ModelNotFoundError,
  ProviderInitError,
  AuthenticationError,
  CapabilityNotSupportedError,
} from "./errors"

// =============================================================================
// Base Class
// =============================================================================

export { BaseProvider } from "./base"

// =============================================================================
// Singleton Accessors
// =============================================================================

export {
  getRegistry,
  getModels,
  getRouter,
  initialize,
  registry,
  models,
  router,
} from "./instance"

// =============================================================================
// Registry Classes (for direct instantiation if needed)
// =============================================================================

export { ProviderRegistry } from "./registry"
export { ModelRegistry } from "./model-registry"
export { ProviderRouter } from "./router"

// =============================================================================
// Routing Strategies
// =============================================================================

export { CapabilityRoutingStrategy } from "./strategies"
