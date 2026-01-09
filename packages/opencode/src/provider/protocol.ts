/**
 * OpenCode Provider Protocol v1.0
 *
 * Complete type definitions for the decoupled provider architecture.
 * This file defines the contract between OpenCode core and provider implementations.
 *
 * @module provider/protocol
 */

import type { JSONSchema7, LanguageModelV2 } from "@ai-sdk/provider"

// =============================================================================
// SECTION 1: CORE PROTOCOL INTERFACE
// =============================================================================

/**
 * Primary contract that all provider implementations must fulfill.
 *
 * Providers are responsible for:
 * - Authentication and credential management
 * - Message normalization for provider-specific quirks
 * - Option building and namespacing
 * - Model instantiation via SDK
 * - Error transformation
 * - Capability declaration
 */
export interface ProviderProtocol {
  /** Unique provider identifier (e.g., 'anthropic', 'openai', 'amazon-bedrock') */
  readonly id: string

  /** NPM package for the AI SDK (e.g., '@ai-sdk/anthropic') */
  readonly sdk: string

  /** Human-readable provider name */
  readonly name: string

  /** Provider website URL */
  readonly url?: string

  // ---------------------------------------------------------------------------
  // Lifecycle Methods
  // ---------------------------------------------------------------------------

  /**
   * Determine if provider should auto-load based on environment.
   * Called during initialization to detect available providers.
   *
   * @param env - Current environment variables
   * @returns true if provider should be loaded automatically
   */
  autoload(env: EnvironmentVariables): boolean

  /**
   * Resolve credentials from available sources.
   * Called when provider is accessed to obtain authentication.
   *
   * Resolution order (typical):
   * 1. Environment variables
   * 2. Configuration file
   * 3. Auth store (persisted keys)
   * 4. Plugin-provided OAuth tokens
   *
   * @param ctx - Authentication context with all credential sources
   * @returns Credentials if authentication successful, null otherwise
   */
  authenticate(ctx: AuthContext): Promise<Credentials | null>

  /**
   * Initialize provider SDK with resolved credentials.
   * Called once per unique credential set (cached by hash).
   *
   * @param credentials - Resolved credentials from authenticate()
   * @param options - Additional SDK options from config
   * @returns Initialized SDK instance
   */
  initializeSDK(credentials: Credentials, options: SDKOptions): Promise<ProviderSDK>

  // ---------------------------------------------------------------------------
  // Model Resolution
  // ---------------------------------------------------------------------------

  /**
   * Get LanguageModelV2 instance for streaming/generation.
   * Handles routing to correct SDK method (chat vs responses vs languageModel).
   *
   * @param sdk - Initialized SDK from initializeSDK()
   * @param modelID - Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o')
   * @param options - Model-specific options
   * @returns AI SDK LanguageModelV2 instance
   */
  getModel(sdk: ProviderSDK, modelID: string, options?: ModelOptions): LanguageModelV2

  /**
   * List available models for this provider.
   * May fetch from remote API or return static list.
   *
   * @param ctx - Context for model listing (may include filters)
   * @returns Array of available models
   */
  listModels(ctx: ListModelsContext): Promise<Model[]>

  // ---------------------------------------------------------------------------
  // Message Transformation
  // ---------------------------------------------------------------------------

  /**
   * Normalize messages for provider-specific requirements.
   * Called before sending messages to the API.
   *
   * Common normalizations:
   * - Tool call ID sanitization (Anthropic: alphanumeric+hyphen+underscore)
   * - Tool call ID formatting (Mistral: exactly 9 alphanumeric chars)
   * - Message sequence repair (Mistral: insert assistant between tool->user)
   * - Empty message filtering (Anthropic: reject empty content)
   * - Reasoning content extraction (move to provider options)
   *
   * @param messages - Input messages from session
   * @param model - Target model for context
   * @returns Normalized messages safe for provider API
   */
  normalizeMessages(messages: ModelMessage[], model: Model): ModelMessage[]

  /**
   * Filter message parts unsupported by provider/model.
   * Called to remove modalities the model cannot process.
   *
   * @param parts - Content parts from message
   * @param model - Target model with capability info
   * @returns Filtered parts with unsupported modalities removed
   */
  filterUnsupportedParts(parts: ContentPart[], model: Model): ContentPart[]

  // ---------------------------------------------------------------------------
  // Options Building
  // ---------------------------------------------------------------------------

  /**
   * Build provider-specific options for API call.
   * Merges session, variant, and provider-specific settings.
   *
   * @param ctx - Context including model, session, variant selection
   * @returns Provider options (not yet namespaced)
   */
  buildOptions(ctx: OptionsContext): ProviderOptions

  /**
   * Build options optimized for small/fast model usage.
   * Used for sub-tasks like summarization, title generation.
   *
   * @param model - Small model being used
   * @returns Minimal options for fast execution
   */
  buildSmallModelOptions(model: Model): ProviderOptions

  /**
   * Wrap options in provider-specific namespace.
   * Required by AI SDK for provider option isolation.
   *
   * @param options - Unwrapped provider options
   * @returns Options wrapped in namespace (e.g., { anthropic: options })
   */
  wrapOptions(options: ProviderOptions): NamespacedOptions

  /**
   * Calculate maximum output tokens accounting for reasoning budget.
   *
   * @param options - Current provider options (may include reasoning config)
   * @param modelLimit - Model's max output token limit
   * @param globalLimit - User-configured global limit
   * @returns Adjusted max output tokens
   */
  calculateMaxOutputTokens(
    options: ProviderOptions,
    modelLimit: number,
    globalLimit: number
  ): number

  // ---------------------------------------------------------------------------
  // Schema Transformation
  // ---------------------------------------------------------------------------

  /**
   * Transform JSON schema for provider compatibility.
   * Some providers have schema restrictions (e.g., Gemini integer enums).
   *
   * @param schema - Input JSON schema for tool parameters
   * @param model - Target model
   * @returns Transformed schema compatible with provider
   */
  transformSchema(schema: JSONSchema7, model: Model): JSONSchema7

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  /**
   * Transform API errors to user-friendly messages.
   * May add provider-specific help links or context.
   *
   * @param error - Raw API error from SDK
   * @returns User-friendly error message
   */
  transformError(error: APICallError): string

  // ---------------------------------------------------------------------------
  // Capability Declaration
  // ---------------------------------------------------------------------------

  /**
   * Declare provider capabilities.
   * Used for routing decisions, UI display, and feature gating.
   *
   * @returns Static capability declaration
   */
  capabilities(): ProviderCapabilities

  /**
   * Get available reasoning variants for a model.
   * Returns empty array if model doesn't support reasoning.
   *
   * @param model - Model to get variants for
   * @returns Available variant configurations
   */
  variants(model: Model): VariantConfig[]

  /**
   * Get provider-specific default parameters.
   * Used when user doesn't specify values.
   *
   * @returns Default sampling parameters
   */
  defaults(): ProviderDefaults

  // ---------------------------------------------------------------------------
  // Caching
  // ---------------------------------------------------------------------------

  /**
   * Apply caching headers/options to messages.
   * Provider-specific cache control format.
   *
   * @param messages - Messages to apply caching to
   * @param sessionID - Session ID for cache key
   * @returns Messages with cache control applied
   */
  applyCaching(messages: ModelMessage[], sessionID: string): ModelMessage[]

  /**
   * Check if provider supports prompt caching.
   *
   * @returns true if caching is supported
   */
  supportsCaching(): boolean

  // ---------------------------------------------------------------------------
  // Headers & Metadata
  // ---------------------------------------------------------------------------

  /**
   * Get custom headers for API requests.
   * Used for tracking, beta features, attribution.
   *
   * @param ctx - Request context
   * @returns Headers to include in API requests
   */
  getHeaders(ctx: HeaderContext): Record<string, string>
}

// =============================================================================
// SECTION 2: SUPPORTING TYPES - AUTHENTICATION
// =============================================================================

/** Environment variables available at runtime */
export type EnvironmentVariables = Record<string, string | undefined>

/** Context provided for authentication resolution */
export interface AuthContext {
  /** Current environment variables */
  env: EnvironmentVariables

  /** User configuration for this provider */
  config: ProviderConfig

  /** Persistent credential store */
  authStore: AuthStore

  /** Loaded plugins that may provide auth */
  plugins: Plugin[]

  /** Project root directory (for relative paths) */
  projectRoot: string
}

/** Persistent credential storage interface */
export interface AuthStore {
  /** Get stored credentials for provider */
  get(providerID: string): Promise<StoredCredentials | null>

  /** Store credentials for provider */
  set(providerID: string, credentials: StoredCredentials): Promise<void>

  /** Remove stored credentials */
  delete(providerID: string): Promise<void>

  /** List all stored provider IDs */
  list(): Promise<string[]>
}

/** Credentials stored in auth store */
export interface StoredCredentials {
  /** API key (if using key auth) */
  apiKey?: string

  /** OAuth access token */
  accessToken?: string

  /** OAuth refresh token */
  refreshToken?: string

  /** Token expiration timestamp */
  expiresAt?: number

  /** Additional provider-specific data */
  metadata?: Record<string, unknown>
}

/** Resolved credentials for provider initialization */
export interface Credentials {
  /** API key for authentication */
  apiKey?: string

  /** Bearer token (OAuth or service account) */
  bearerToken?: string

  /** AWS credentials (for Bedrock) */
  aws?: AWSCredentials

  /** Google credentials (for Vertex) */
  google?: GoogleCredentials

  /** Custom authentication data */
  custom?: Record<string, unknown>
}

/** AWS credential structure */
export interface AWSCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
}

/** Google credential structure */
export interface GoogleCredentials {
  projectId: string
  location: string
  /** Uses Application Default Credentials if true */
  useADC: boolean
}

/** Plugin interface for auth providers */
export interface Plugin {
  /** Plugin identifier */
  id: string

  /** Auth capabilities */
  auth?: PluginAuth
}

/** Plugin authentication interface */
export interface PluginAuth {
  /** Available auth methods */
  methods: AuthMethod[]

  /** Custom credential loader */
  loader?(ctx: AuthContext): Promise<Credentials | null>

  /** OAuth authorization handler */
  authorize?(method: AuthMethod): Promise<AuthorizationResult>

  /** OAuth callback handler */
  callback?(method: AuthMethod, code: string): Promise<Credentials>
}

/** Authentication method descriptor */
export interface AuthMethod {
  /** Method type */
  type: AuthenticationType

  /** Human-readable label */
  label: string

  /** Method description */
  description?: string

  /** OAuth configuration (if type is 'oauth') */
  oauth?: OAuthConfig
}

/** OAuth configuration */
export interface OAuthConfig {
  /** Authorization URL */
  authorizationUrl: string

  /** Token exchange URL */
  tokenUrl: string

  /** Required scopes */
  scopes: string[]

  /** OAuth flow type */
  flow: "authorization_code" | "device_code" | "client_credentials"
}

/** Result of OAuth authorization initiation */
export interface AuthorizationResult {
  /** URL for user to visit */
  url: string

  /** Device code (for device flow) */
  deviceCode?: string

  /** User instructions */
  instructions?: string
}

// =============================================================================
// SECTION 3: SUPPORTING TYPES - MODELS
// =============================================================================

/** Complete model metadata */
export interface Model {
  /** Model identifier (e.g., 'claude-sonnet-4-20250514') */
  id: string

  /** Provider that offers this model */
  providerID: string

  /** Human-readable model name */
  name: string

  /** Model family (e.g., 'claude', 'gpt', 'gemini') */
  family: string

  /** Model status */
  status: ModelStatus

  /** Capability flags */
  capabilities: ModelCapabilities

  /** Input/output modalities */
  modalities: ModelModalities

  /** Token limits */
  limits: ModelLimits

  /** Pricing information */
  cost: ModelCost

  /** Available reasoning variants */
  variants?: string[]

  /** API configuration */
  api: ModelAPIConfig

  /** Model aliases (alternative IDs) */
  aliases?: string[]

  /** Release date (for feature gating) */
  releaseDate?: string
}

/** Model lifecycle status */
export type ModelStatus = "active" | "deprecated" | "preview" | "alpha"

/** Model capability flags */
export interface ModelCapabilities {
  /** Supports extended reasoning/thinking */
  reasoning: boolean

  /** Supports temperature parameter */
  temperature: boolean

  /** Supports tool/function calling */
  toolCall: boolean

  /** Supports file attachments */
  attachment: boolean

  /** Supports structured output (JSON mode) */
  structuredOutput: boolean

  /** Supports streaming responses */
  streaming: boolean

  /** Supports system messages */
  systemMessage: boolean

  /** Supports multi-turn conversations */
  multiTurn: boolean

  /** Supports interleaved thinking output (reasoning interleaved with response) */
  interleaved?: boolean | { field: "reasoning_content" | "reasoning_details" }
}

/** Model input/output modality support */
export interface ModelModalities {
  /** Supported input types */
  input: Modality[]

  /** Supported output types */
  output: Modality[]
}

/** Content modality types */
export type Modality = "text" | "image" | "audio" | "video" | "pdf" | "file"

/** Model token limits */
export interface ModelLimits {
  /** Maximum context window (input + output) */
  context: number

  /** Maximum output tokens */
  output: number

  /** Maximum reasoning/thinking tokens (if applicable) */
  reasoning?: number
}

/** Model pricing (USD per million tokens) */
export interface ModelCost {
  /** Cost per million input tokens */
  input: number

  /** Cost per million output tokens */
  output: number

  /** Cost for cached tokens */
  cache?: {
    /** Cost per million cached read tokens */
    read: number
    /** Cost per million cached write tokens */
    write: number
  }

  /** Cost per million cached input tokens (alternative to cache.read) */
  cachedInput?: number

  /** Cost per million reasoning tokens */
  reasoning?: number
}

/** Model API configuration */
export interface ModelAPIConfig {
  /** NPM package for SDK */
  npm: string

  /** Base URL override */
  baseURL?: string

  /** API version */
  version?: string
}

/** Context for listing models */
export interface ListModelsContext {
  /** Include preview/alpha models */
  includePreview?: boolean

  /** Include deprecated models */
  includeDeprecated?: boolean

  /** Filter by capability */
  requiredCapabilities?: (keyof ModelCapabilities)[]

  /** Filter by modality */
  requiredModalities?: Modality[]
}

// =============================================================================
// SECTION 4: SUPPORTING TYPES - MESSAGES
// =============================================================================

/** Message in conversation */
export interface ModelMessage {
  /** Message role */
  role: MessageRole

  /** Message content (string or structured parts) */
  content: string | ContentPart[]

  /** Tool call ID (for tool results) */
  toolCallId?: string

  /** Tool calls made by assistant */
  toolCalls?: ToolCall[]

  /** Message metadata */
  metadata?: MessageMetadata
}

/** Message role types */
export type MessageRole = "system" | "user" | "assistant" | "tool"

/** Structured content part */
export type ContentPart =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | FilePart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart

/** Text content */
export interface TextPart {
  type: "text"
  text: string
}

/** Image content */
export interface ImagePart {
  type: "image"
  /** Base64 encoded image or URL */
  image: string | URL
  /** MIME type */
  mimeType?: string
}

/** Audio content */
export interface AudioPart {
  type: "audio"
  audio: string | URL
  mimeType?: string
}

/** Video content */
export interface VideoPart {
  type: "video"
  video: string | URL
  mimeType?: string
}

/** File content */
export interface FilePart {
  type: "file"
  file: string | URL
  mimeType?: string
  filename?: string
}

/** Tool call request */
export interface ToolCallPart {
  type: "tool_call"
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

/** Tool execution result */
export interface ToolResultPart {
  type: "tool_result"
  toolCallId: string
  result: unknown
  isError?: boolean
}

/** Reasoning/thinking content */
export interface ReasoningPart {
  type: "reasoning"
  reasoning: string
  /** Encrypted reasoning (OpenAI) */
  encrypted?: string
}

/** Tool call structure */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** Message metadata */
export interface MessageMetadata {
  /** Timestamp */
  timestamp?: number

  /** Token count */
  tokens?: number

  /** Cache control */
  cacheControl?: CacheControl

  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>
}

/** Cache control configuration */
export interface CacheControl {
  type: "ephemeral" | "persistent"
  ttl?: number
}

// =============================================================================
// SECTION 5: SUPPORTING TYPES - OPTIONS
// =============================================================================

/** Context for building provider options */
export interface OptionsContext {
  /** Target model */
  model: Model

  /** Session identifier */
  sessionID: string

  /** Selected reasoning variant */
  variant?: string

  /** Agent configuration */
  agent?: AgentConfig

  /** User-provided provider options */
  userOptions?: Record<string, unknown>

  /** Whether this is a small model call */
  isSmallModel?: boolean
}

/** Agent configuration */
export interface AgentConfig {
  /** Agent identifier */
  id: string

  /** Agent name */
  name: string

  /** Preferred model */
  model?: ModelReference

  /** Agent-specific options */
  options?: Record<string, unknown>
}

/** Reference to a model */
export interface ModelReference {
  providerID: string
  modelID: string
}

/** Provider-specific options (before namespacing) */
export interface ProviderOptions {
  /** Reasoning configuration */
  reasoning?: ReasoningConfig

  /** Cache configuration */
  caching?: CachingConfig

  /** Custom headers */
  headers?: Record<string, string>

  /** Timeout in milliseconds */
  timeout?: number

  /** Additional provider-specific options */
  [key: string]: unknown
}

/** Reasoning configuration */
export interface ReasoningConfig {
  /** Effort level (OpenAI, Groq, etc.) */
  effort?: ReasoningEffort

  /** Token budget (Anthropic, Google) */
  budgetTokens?: number

  /** Include reasoning in response */
  includeThoughts?: boolean

  /** Reasoning summary mode (OpenAI) */
  summary?: "auto" | "none"
}

/** Reasoning effort levels */
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "max"

/** Caching configuration */
export interface CachingConfig {
  /** Enable prompt caching */
  enabled: boolean

  /** Cache key (usually session ID) */
  key?: string

  /** Cache control type */
  type?: "ephemeral" | "persistent"
}

/** Options wrapped in provider namespace */
export type NamespacedOptions = {
  [namespace: string]: ProviderOptions
}

/** SDK initialization options */
export interface SDKOptions {
  /** Base URL override */
  baseURL?: string

  /** Custom headers */
  headers?: Record<string, string>

  /** Request timeout in milliseconds, or false to disable */
  timeout?: number | false

  /** Custom fetch implementation */
  fetch?: typeof fetch

  /** Additional SDK-specific options */
  [key: string]: unknown
}

/** Context for getting headers */
export interface HeaderContext {
  /** Current session ID */
  sessionID?: string

  /** Current request ID */
  requestID?: string

  /** Client identifier */
  clientID?: string

  /** Project identifier */
  projectID?: string
}

// =============================================================================
// SECTION 6: SUPPORTING TYPES - CAPABILITIES
// =============================================================================

/** Provider capability declaration */
export interface ProviderCapabilities {
  /** Supports prompt caching */
  caching: boolean

  /** Reasoning support type */
  reasoning: ReasoningSupport

  /** Supported modalities */
  modalities: ProviderModalities

  /** Available authentication methods */
  authentication: AuthenticationType[]

  /** Supports streaming responses */
  streaming: boolean

  /** Supports tool/function calling */
  toolCalling: boolean

  /** Supports structured output */
  structuredOutput: boolean

  /** Maximum concurrent requests */
  maxConcurrency?: number

  /** Rate limits */
  rateLimits?: RateLimits
}

/** Reasoning support type */
export type ReasoningSupport =
  | "none"    // No reasoning support
  | "effort"  // Effort levels (low/medium/high)
  | "budget"  // Token budgets

/** Provider modality support */
export interface ProviderModalities {
  input: Modality[]
  output: Modality[]
}

/** Authentication types */
export type AuthenticationType =
  | "api_key"
  | "oauth"
  | "adc"        // Application Default Credentials (Google)
  | "aws_chain"  // AWS credential chain
  | "custom"

/** Rate limit configuration */
export interface RateLimits {
  /** Requests per minute */
  requestsPerMinute?: number

  /** Tokens per minute */
  tokensPerMinute?: number

  /** Tokens per day */
  tokensPerDay?: number
}

/** Variant configuration */
export interface VariantConfig {
  /** Variant name (e.g., 'high', 'max') */
  name: string

  /** Human-readable label */
  label?: string

  /** Variant description */
  description?: string

  /** Provider options for this variant */
  options: ProviderOptions
}

/** Provider default parameters */
export interface ProviderDefaults {
  /** Default temperature */
  temperature?: number

  /** Default top-p */
  topP?: number

  /** Default top-k */
  topK?: number

  /** Default max tokens */
  maxTokens?: number
}

// =============================================================================
// SECTION 7: SUPPORTING TYPES - CONFIGURATION
// =============================================================================

/** Provider configuration from user config file */
export interface ProviderConfig {
  /** Override provider name */
  name?: string

  /** Override base URL */
  baseURL?: string

  /** Override API key env var name */
  apiKeyEnvVar?: string

  /** Custom headers */
  headers?: Record<string, string>

  /** Model overrides */
  models?: Record<string, Partial<Model>>

  /** Variant overrides */
  variants?: Record<string, VariantConfig>

  /** Provider-specific options */
  options?: Record<string, unknown>

  /** Disabled flag */
  disabled?: boolean
}

// =============================================================================
// SECTION 8: SUPPORTING TYPES - ERRORS
// =============================================================================

/** API call error from SDK */
export interface APICallError extends Error {
  /** HTTP status code */
  statusCode?: number

  /** Error code from provider */
  code?: string

  /** Raw response body */
  responseBody?: unknown

  /** Request that caused error */
  request?: {
    url: string
    method: string
    headers: Record<string, string>
    body?: unknown
  }
}

// =============================================================================
// SECTION 9: PROVIDER SDK INTERFACE
// =============================================================================

/**
 * Generic SDK interface returned by provider initialization.
 * Actual type depends on the specific SDK package.
 */
export interface ProviderSDK {
  /** Get language model by ID */
  languageModel?(modelID: string): LanguageModelV2

  /** Get chat model by ID (OpenAI-style) */
  chat?(modelID: string): LanguageModelV2

  /** Get responses model by ID (OpenAI Responses API) */
  responses?(modelID: string): LanguageModelV2

  /** SDK-specific methods */
  [method: string]: unknown
}

// =============================================================================
// SECTION 10: PROVIDER REGISTRY INTERFACE
// =============================================================================

/**
 * Registry for managing provider instances.
 * Handles provider registration, lookup, and lifecycle.
 */
export interface IProviderRegistry {
  /**
   * Get provider by ID.
   *
   * @param id - Provider identifier
   * @returns Provider instance or undefined
   */
  get(id: string): ProviderProtocol | undefined

  /**
   * Get provider by ID, throwing if not found.
   *
   * @param id - Provider identifier
   * @returns Provider instance
   * @throws ProviderInitError if not found
   */
  getOrThrow(id: string): ProviderProtocol

  /**
   * List all registered providers.
   *
   * @returns Array of provider instances
   */
  list(): ProviderProtocol[]

  /**
   * List providers with availability status.
   * Checks authentication for each provider.
   *
   * @returns Array of provider info with availability
   */
  listAvailable(): Promise<ProviderInfo[]>

  /**
   * Register a provider instance.
   *
   * @param provider - Provider to register
   */
  register(provider: ProviderProtocol): void

  /**
   * Unregister a provider.
   *
   * @param id - Provider ID to remove
   */
  unregister(id: string): void

  /**
   * Load provider from npm package.
   *
   * @param npm - NPM package name
   * @returns Loaded provider
   */
  loadExternal(npm: string): Promise<ProviderProtocol>

  /**
   * Get initialized SDK for provider.
   * Caches SDK instances by credential hash.
   *
   * @param provider - Provider to get SDK for
   * @returns Initialized SDK
   */
  getSDK(provider: ProviderProtocol): Promise<ProviderSDK>

  /**
   * Clear SDK cache for provider.
   *
   * @param providerID - Provider ID to clear cache for
   */
  clearSDKCache(providerID: string): void

  /**
   * Check if provider is available (authenticated).
   *
   * @param id - Provider identifier
   * @returns true if provider is authenticated and ready
   */
  isAvailable(id: string): Promise<boolean>
}

/** Provider info with availability status */
export interface ProviderInfo {
  /** Provider identifier */
  id: string

  /** Provider name */
  name: string

  /** Provider URL */
  url?: string

  /** Is provider available (authenticated) */
  available: boolean

  /** Reason if unavailable */
  unavailableReason?: string

  /** Provider capabilities */
  capabilities: ProviderCapabilities

  /** Available models */
  models: Model[]

  /** Default model ID */
  defaultModel?: string
}

// =============================================================================
// SECTION 11: PROVIDER ROUTER INTERFACE
// =============================================================================

/**
 * Router for selecting providers based on request characteristics.
 * Implements routing strategies and fallback logic.
 */
export interface IProviderRouter {
  /**
   * Route request to appropriate provider.
   *
   * @param ctx - Routing context with request characteristics
   * @returns Selected provider
   * @throws Error if no suitable provider available
   */
  route(ctx: RouteContext): ProviderProtocol

  /**
   * Get fallback provider after failure.
   *
   * @param ctx - Original routing context
   * @param failed - Provider that failed
   * @param error - Error that occurred
   * @returns Fallback provider or null if none available
   */
  fallback(
    ctx: RouteContext,
    failed: ProviderProtocol,
    error: Error
  ): ProviderProtocol | null

  /**
   * Set routing strategy.
   *
   * @param strategy - Routing strategy to use
   */
  setStrategy(strategy: RoutingStrategy): void

  /**
   * Get current routing strategy.
   *
   * @returns Current strategy
   */
  getStrategy(): RoutingStrategy
}

/** Context for routing decisions */
export interface RouteContext {
  /** Task type being performed */
  task: TaskType

  /** Required input modalities */
  modalities: Set<Modality>

  /** Estimated complexity */
  complexity: ComplexityEstimate

  /** Explicit provider hint (from user) */
  providerHint?: string

  /** Explicit model hint (from user) */
  modelHint?: string

  /** Message history (for context) */
  history?: ModelMessage[]

  /** Current message */
  message?: ModelMessage

  /** Session metadata */
  session?: SessionMetadata

  /** Routing preferences */
  preferences?: RoutePreferences
}

/** Task type classification */
export type TaskType =
  | "reasoning"      // Complex multi-step thinking
  | "code"           // Code generation/analysis
  | "vision"         // Image/video understanding
  | "summarization"  // Condensing information
  | "extraction"     // Structured data extraction
  | "conversation"   // General chat
  | "embedding"      // Vector embeddings
  | "sub-task"       // Agent-spawned sub-task

/** Complexity estimate for routing */
export interface ComplexityEstimate {
  /** Estimated input tokens */
  tokens: number

  /** Number of tools available */
  tools: number

  /** Estimated turns needed */
  turns?: number
}

/** Session metadata for routing */
export interface SessionMetadata {
  /** Session identifier */
  id: string

  /** Primary provider used in session */
  primaryProvider?: string

  /** Total tokens used */
  totalTokens?: number

  /** Total cost incurred */
  totalCost?: number
}

/** User routing preferences */
export interface RoutePreferences {
  /** Preferred providers (in order) */
  preferredProviders?: string[]

  /** Blocked providers */
  blockedProviders?: string[]

  /** Cost tolerance */
  costTolerance?: "low" | "medium" | "high"

  /** Latency tolerance */
  latencyTolerance?: "low" | "medium" | "high"

  /** Quality preference */
  qualityPreference?: "fast" | "balanced" | "best"
}

/** Routing strategy interface */
export interface RoutingStrategy {
  /** Strategy name */
  readonly name: string

  /**
   * Select provider for request.
   *
   * @param ctx - Routing context
   * @param available - Available providers
   * @returns Selected provider
   */
  select(ctx: RouteContext, available: ProviderProtocol[]): ProviderProtocol

  /**
   * Select fallback after failure.
   *
   * @param ctx - Routing context
   * @param failed - Failed provider
   * @param error - Error that occurred
   * @param remaining - Remaining providers
   * @returns Fallback provider or null
   */
  selectFallback(
    ctx: RouteContext,
    failed: ProviderProtocol,
    error: Error,
    remaining: ProviderProtocol[]
  ): ProviderProtocol | null
}

// =============================================================================
// SECTION 12: MODEL REGISTRY INTERFACE
// =============================================================================

/**
 * Registry for managing model metadata.
 * Handles model lookup, caching, and refresh from remote sources.
 */
export interface IModelRegistry {
  /**
   * Get model by provider and model ID.
   *
   * @param providerID - Provider identifier
   * @param modelID - Model identifier
   * @returns Model or undefined
   */
  get(providerID: string, modelID: string): Model | undefined

  /**
   * Get model, throwing if not found.
   *
   * @param providerID - Provider identifier
   * @param modelID - Model identifier
   * @returns Model
   * @throws ModelNotFoundError
   */
  getOrThrow(providerID: string, modelID: string): Model

  /**
   * List models, optionally filtered by provider.
   *
   * @param providerID - Optional provider filter
   * @returns Array of models
   */
  list(providerID?: string): Model[]

  /**
   * Refresh model data from remote source.
   *
   * @returns Promise that resolves when refresh complete
   */
  refresh(): Promise<void>

  /**
   * Parse model string into provider/model IDs.
   * Supports formats: "providerID/modelID", "modelID" (uses default provider)
   *
   * @param modelString - Model string to parse
   * @returns Parsed provider and model IDs
   */
  parse(modelString: string): ModelReference

  /**
   * Sort models by priority/quality.
   *
   * @param models - Models to sort
   * @returns Sorted models (best first)
   */
  sort(models: Model[]): Model[]

  /**
   * Find closest matching model by query strings.
   * Uses fuzzy matching.
   *
   * @param providerID - Provider to search
   * @param queries - Search queries
   * @returns Best matching model or undefined
   */
  closest(providerID: string, queries: string[]): Model | undefined

  /**
   * Get default model (from configuration).
   *
   * @returns Default model
   * @throws Error if no default configured
   */
  default(): Promise<Model>

  /**
   * Get small/fast model for sub-tasks.
   *
   * @param providerID - Provider to get small model for
   * @returns Small model for provider
   */
  small(providerID: string): Model

  /**
   * Register model override from configuration.
   *
   * @param providerID - Provider ID
   * @param modelID - Model ID
   * @param overrides - Partial model data to merge
   */
  registerOverride(
    providerID: string,
    modelID: string,
    overrides: Partial<Model>
  ): void
}

// =============================================================================
// SECTION 13: MODEL OPTIONS
// =============================================================================

/** Options for model instantiation */
export interface ModelOptions {
  /** Override base URL */
  baseURL?: string

  /** Custom headers */
  headers?: Record<string, string>

  /** Abort signal for cancellation */
  abortSignal?: AbortSignal
}
