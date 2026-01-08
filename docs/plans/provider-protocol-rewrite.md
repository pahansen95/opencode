# Provider Protocol Direct Rewrite Plan

## Overview

Direct rewrite of OpenCode's provider implementation from monolithic namespace architecture to decoupled protocol-based architecture.

**Approach**: Build new implementation in parallel directory, update all consumers, perform atomic cutover.

**Scope**:
- 16 source files in `packages/opencode/src/provider/`
- 58 consumer call sites across 16 files
- 14 provider implementations

---

## Directory Structure

### Current
```
packages/opencode/src/provider/
├── provider.ts          # 1,135 lines - monolithic
├── transform.ts         # 648 lines - switch statements
├── auth.ts              # 143 lines
├── models.ts            # 106 lines
├── models-macro.ts      # 12 lines
└── sdk/openai-compatible/  # ~2,000 lines
```

### Target
```
packages/opencode/src/provider/
├── index.ts                 # Public exports
├── protocol.ts              # Interface definitions
├── errors.ts                # Error classes
├── base.ts                  # BaseProvider abstract class
├── registry.ts              # ProviderRegistry implementation
├── model-registry.ts        # ModelRegistry implementation
├── router.ts                # ProviderRouter implementation
├── health.ts                # HealthMonitor implementation
├── usage.ts                 # UsageTracker implementation
├── instance.ts              # Singleton instances
├── auth.ts                  # Auth utilities (preserved)
├── strategies/
│   ├── index.ts
│   └── capability.ts        # Default routing strategy
├── providers/
│   ├── index.ts             # Provider registration
│   ├── anthropic.ts
│   ├── openai.ts
│   ├── amazon-bedrock.ts
│   ├── azure.ts
│   ├── azure-cognitive.ts
│   ├── google.ts
│   ├── google-vertex.ts
│   ├── google-vertex-anthropic.ts
│   ├── github-copilot.ts
│   ├── github-copilot-enterprise.ts
│   ├── openrouter.ts
│   ├── cloudflare.ts
│   ├── cerebras.ts
│   ├── groq.ts
│   ├── mistral.ts
│   └── opencode.ts
└── sdk/openai-compatible/   # Preserved unchanged
```

---

## Phase 0: Preparation

### 0.1 Create Golden Test Suite

Capture current provider behavior as test fixtures.

**File**: `packages/opencode/src/provider/__tests__/golden.test.ts`

```typescript
import { describe, it, expect } from "bun:test"
import { Provider } from "../provider"
import { ProviderTransform } from "../transform"

const TEST_MESSAGES = [
  // Empty message
  { role: "user", content: "" },
  // Tool call with special chars
  { role: "assistant", content: "", toolCalls: [{ id: "call_abc!@#123", name: "test", arguments: {} }] },
  // Multi-part content
  { role: "user", content: [{ type: "text", text: "hello" }, { type: "image", image: "base64..." }] },
]

const PROVIDERS_TO_TEST = [
  "anthropic",
  "openai",
  "amazon-bedrock",
  "azure",
  "google",
  "google-vertex",
  "github-copilot",
  "openrouter",
  "cloudflare",
  "cerebras",
  "groq",
  "mistral",
]

describe("Provider Golden Tests", () => {
  for (const providerID of PROVIDERS_TO_TEST) {
    describe(providerID, () => {
      it("message normalization", () => {
        const model = { providerID, id: "test-model", api: { npm: getSDKForProvider(providerID) } }
        const result = ProviderTransform.message(TEST_MESSAGES, model)
        expect(result).toMatchSnapshot()
      })

      it("options building", () => {
        const model = { providerID, id: "test-model", api: { npm: getSDKForProvider(providerID) } }
        const result = ProviderTransform.options(model, "test-session", {})
        expect(result).toMatchSnapshot()
      })

      it("variants", () => {
        const model = { providerID, id: "test-model", reasoning: true, api: { npm: getSDKForProvider(providerID) } }
        const result = ProviderTransform.variants(model)
        expect(result).toMatchSnapshot()
      })

      it("provider options wrapping", () => {
        const model = { providerID, id: "test-model", api: { npm: getSDKForProvider(providerID) } }
        const opts = { temperature: 0.7, maxTokens: 1000 }
        const result = ProviderTransform.providerOptions(model, opts)
        expect(result).toMatchSnapshot()
      })

      it("defaults", () => {
        const model = { providerID, id: "test-model", api: { npm: getSDKForProvider(providerID) } }
        expect({
          temperature: ProviderTransform.temperature(model),
          topP: ProviderTransform.topP(model),
          topK: ProviderTransform.topK(model),
        }).toMatchSnapshot()
      })
    })
  }
})
```

**Tasks**:
- [ ] Create `golden.test.ts` with behavior capture tests
- [ ] Run tests to generate initial snapshots
- [ ] Verify snapshots cover all provider-specific behaviors
- [ ] Add edge case tests for each provider's quirks

### 0.2 Document Provider Behaviors

Create behavior documentation for each provider.

**File**: `docs/provider-analysis/{provider}.md` (already exists, verify completeness)

**Checklist per provider**:
- [ ] Authentication methods and env vars
- [ ] Custom loader logic
- [ ] Message normalization rules
- [ ] Tool ID sanitization rules
- [ ] Options building logic
- [ ] Variants configuration
- [ ] Caching support and format
- [ ] Custom headers
- [ ] Error transformation
- [ ] Schema transformation (if any)

### 0.3 Audit Consumer Call Sites

Document every provider usage.

**File**: `docs/plans/provider-consumer-audit.md`

| File | Line | Function Called | Purpose |
|------|------|-----------------|---------|
| session/llm.ts | 55 | Provider.getLanguage | Get LLM instance |
| session/llm.ts | 84 | Provider.getProvider | Get provider config |
| ... | ... | ... | ... |

**Tasks**:
- [ ] Grep all `Provider.` usages
- [ ] Grep all `ProviderTransform.` usages
- [ ] Grep all `ProviderAuth.` usages
- [ ] Grep all `ModelsDev.` usages
- [ ] Document transformation needed for each

### 0.4 Set Up Development Branch

```bash
git checkout dev
git checkout -b feature/provider-protocol-v2
```

---

## Phase 1: Foundation

### 1.1 Protocol Interfaces

**File**: `packages/opencode/src/provider/protocol.ts`

Copy from `docs/provider-protocol-stubs.ts`, sections 1-8.

**Contents**:
- `ProviderProtocol` interface (20 methods)
- `AuthContext`, `Credentials`, `AuthStore` types
- `Model`, `ModelCapabilities`, `ModelModalities` types
- `ModelMessage`, `ContentPart` types
- `OptionsContext`, `ProviderOptions` types
- `ProviderCapabilities`, `VariantConfig` types
- `ProviderConfig` type

**Tasks**:
- [ ] Create `protocol.ts` with all interfaces
- [ ] Ensure all types are exported
- [ ] Add JSDoc to all public interfaces
- [ ] Verify no circular dependencies

### 1.2 Error Classes

**File**: `packages/opencode/src/provider/errors.ts`

```typescript
export class ModelNotFoundError extends Error {
  constructor(
    public readonly providerID: string,
    public readonly modelID: string,
    public readonly suggestions?: string[]
  ) {
    const suggestionText = suggestions?.length
      ? `\nDid you mean: ${suggestions.join(", ")}?`
      : ""
    super(`Model '${modelID}' not found for provider '${providerID}'${suggestionText}`)
    this.name = "ModelNotFoundError"
  }

  static isInstance(error: unknown): error is ModelNotFoundError {
    return error instanceof ModelNotFoundError
  }
}

export class ProviderInitError extends Error {
  constructor(
    public readonly providerID: string,
    public readonly reason: string,
    public readonly cause?: Error
  ) {
    super(`Failed to initialize provider '${providerID}': ${reason}`)
    this.name = "ProviderInitError"
    if (cause) this.cause = cause
  }

  static isInstance(error: unknown): error is ProviderInitError {
    return error instanceof ProviderInitError
  }
}

export class AuthenticationError extends Error {
  constructor(
    public readonly providerID: string,
    public readonly method: string,
    public readonly reason: string
  ) {
    super(`Authentication failed for '${providerID}' using ${method}: ${reason}`)
    this.name = "AuthenticationError"
  }

  static isInstance(error: unknown): error is AuthenticationError {
    return error instanceof AuthenticationError
  }
}

export class CapabilityNotSupportedError extends Error {
  constructor(
    public readonly providerID: string,
    public readonly capability: string,
    public readonly alternatives?: string[]
  ) {
    const altText = alternatives?.length
      ? `\nProviders with this capability: ${alternatives.join(", ")}`
      : ""
    super(`Provider '${providerID}' does not support '${capability}'${altText}`)
    this.name = "CapabilityNotSupportedError"
  }

  static isInstance(error: unknown): error is CapabilityNotSupportedError {
    return error instanceof CapabilityNotSupportedError
  }
}
```

**Tasks**:
- [ ] Create `errors.ts`
- [ ] Add `isInstance` static methods for type guards
- [ ] Ensure error messages match current format

### 1.3 Base Provider

**File**: `packages/opencode/src/provider/base.ts`

```typescript
import type {
  ProviderProtocol,
  ProviderCapabilities,
  ProviderDefaults,
  ProviderOptions,
  NamespacedOptions,
  ProviderSDK,
  Credentials,
  SDKOptions,
  AuthContext,
  OptionsContext,
  HeaderContext,
  ListModelsContext,
  ModelOptions,
  Model,
  ModelMessage,
  ContentPart,
  VariantConfig,
  Modality,
  CacheControl,
  EnvironmentVariables,
} from "./protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"
import type { JSONSchema7 } from "json-schema"

export abstract class BaseProvider implements ProviderProtocol {
  abstract readonly id: string
  abstract readonly sdk: string
  abstract readonly name: string
  readonly url?: string

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  autoload(_env: EnvironmentVariables): boolean {
    return false
  }

  abstract authenticate(ctx: AuthContext): Promise<Credentials | null>

  async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    const sdkModule = await import(this.sdk)
    const factory = this.getSDKFactory(sdkModule)
    return factory({
      apiKey: credentials.apiKey,
      ...options,
    })
  }

  protected getSDKFactory(sdkModule: any): (options: any) => ProviderSDK {
    // Try common factory names
    if (sdkModule.default) return sdkModule.default
    const factoryName = `create${this.name.replace(/[^a-zA-Z]/g, "")}`
    if (sdkModule[factoryName]) return sdkModule[factoryName]
    throw new Error(`Cannot find SDK factory in ${this.sdk}`)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Model Resolution - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  getModel(
    sdk: ProviderSDK,
    modelID: string,
    _options?: ModelOptions
  ): LanguageModelV2 {
    if (typeof sdk.languageModel === "function") {
      return sdk.languageModel(modelID)
    }
    if (typeof sdk.chat === "function") {
      return sdk.chat(modelID)
    }
    throw new Error(`SDK does not support languageModel or chat methods`)
  }

  abstract listModels(ctx: ListModelsContext): Promise<Model[]>

  // ─────────────────────────────────────────────────────────────────────────
  // Message Transformation - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  normalizeMessages(messages: ModelMessage[], _model: Model): ModelMessage[] {
    return messages
  }

  filterUnsupportedParts(parts: ContentPart[], model: Model): ContentPart[] {
    const supported = new Set(model.modalities.input)
    return parts.filter((part) => {
      const modality = this.getPartModality(part)
      return supported.has(modality)
    })
  }

  protected getPartModality(part: ContentPart): Modality {
    switch (part.type) {
      case "text":
      case "reasoning":
      case "tool_call":
      case "tool_result":
        return "text"
      case "image":
        return "image"
      case "audio":
        return "audio"
      case "video":
        return "video"
      case "file":
        return "file"
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Options Building - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  buildOptions(ctx: OptionsContext): ProviderOptions {
    const options: ProviderOptions = {}

    if (ctx.variant) {
      const variantConfig = this.variants(ctx.model).find(
        (v) => v.name === ctx.variant
      )
      if (variantConfig) {
        Object.assign(options, variantConfig.options)
      }
    }

    if (ctx.userOptions) {
      Object.assign(options, ctx.userOptions)
    }

    return options
  }

  buildSmallModelOptions(_model: Model): ProviderOptions {
    return {}
  }

  abstract wrapOptions(options: ProviderOptions): NamespacedOptions

  calculateMaxOutputTokens(
    options: ProviderOptions,
    modelLimit: number,
    globalLimit: number
  ): number {
    const baseLimit = Math.min(modelLimit, globalLimit)
    const reasoningBudget = options.reasoning?.budgetTokens ?? 0
    return Math.max(baseLimit - reasoningBudget, 1000)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Schema & Error Transformation - Override as needed
  // ─────────────────────────────────────────────────────────────────────────

  transformSchema(schema: JSONSchema7, _model: Model): JSONSchema7 {
    return schema
  }

  transformError(error: Error & { message: string }): string {
    return error.message
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Capabilities - Must override
  // ─────────────────────────────────────────────────────────────────────────

  abstract capabilities(): ProviderCapabilities

  variants(_model: Model): VariantConfig[] {
    return []
  }

  defaults(): ProviderDefaults {
    return {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Caching - Override if supported
  // ─────────────────────────────────────────────────────────────────────────

  applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    return messages
  }

  supportsCaching(): boolean {
    return this.capabilities().caching
  }

  protected applyCacheMarkers(
    messages: ModelMessage[],
    config: {
      systemCount: number
      tailCount: number
      cacheControl: CacheControl
    }
  ): ModelMessage[] {
    const result = [...messages]
    let systemMarked = 0
    let tailMarked = 0

    // Mark system messages from start
    for (let i = 0; i < result.length && systemMarked < config.systemCount; i++) {
      if (result[i].role === "system") {
        result[i] = {
          ...result[i],
          metadata: {
            ...result[i].metadata,
            cacheControl: config.cacheControl,
          },
        }
        systemMarked++
      }
    }

    // Mark non-system messages from end
    for (let i = result.length - 1; i >= 0 && tailMarked < config.tailCount; i--) {
      if (result[i].role !== "system") {
        result[i] = {
          ...result[i],
          metadata: {
            ...result[i].metadata,
            cacheControl: config.cacheControl,
          },
        }
        tailMarked++
      }
    }

    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Headers - Override if needed
  // ─────────────────────────────────────────────────────────────────────────

  getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility Methods for Subclasses
  // ─────────────────────────────────────────────────────────────────────────

  protected sanitizeToolCallId(
    id: string,
    pattern: RegExp,
    replacement: string
  ): string {
    return id.replace(pattern, replacement)
  }

  protected filterEmptyMessages(messages: ModelMessage[]): ModelMessage[] {
    return messages.filter((m) => {
      if (typeof m.content === "string") {
        return m.content.length > 0
      }
      return m.content.length > 0
    })
  }

  protected filterEmptyParts(message: ModelMessage): ModelMessage {
    if (typeof message.content === "string") return message
    return {
      ...message,
      content: message.content.filter((part) => {
        if (part.type === "text") return part.text.length > 0
        if (part.type === "reasoning") return part.reasoning.length > 0
        return true
      }),
    }
  }

  protected mapToolCallIds(
    message: ModelMessage,
    mapper: (id: string) => string
  ): ModelMessage {
    if (!message.toolCalls) return message
    return {
      ...message,
      toolCalls: message.toolCalls.map((tc) => ({
        ...tc,
        id: mapper(tc.id),
      })),
    }
  }
}
```

**Tasks**:
- [ ] Create `base.ts` with `BaseProvider` class
- [ ] Implement all default methods
- [ ] Add utility methods used by multiple providers
- [ ] Add comprehensive JSDoc

### 1.4 Provider Registry

**File**: `packages/opencode/src/provider/registry.ts`

```typescript
import type {
  ProviderProtocol,
  ProviderRegistry as IProviderRegistry,
  ProviderInfo,
  ProviderSDK,
  Credentials,
  AuthContext,
} from "./protocol"
import { ProviderInitError } from "./errors"
import { Auth } from "@/auth"
import { Config } from "@/config"
import { Plugin } from "@/plugin"

export class ProviderRegistry implements IProviderRegistry {
  private providers = new Map<string, ProviderProtocol>()
  private sdkCache = new Map<string, ProviderSDK>()
  private credentialCache = new Map<string, Credentials>()

  get(id: string): ProviderProtocol | undefined {
    return this.providers.get(id)
  }

  getOrThrow(id: string): ProviderProtocol {
    const provider = this.providers.get(id)
    if (!provider) {
      throw new ProviderInitError(id, "Provider not registered")
    }
    return provider
  }

  list(): ProviderProtocol[] {
    return Array.from(this.providers.values())
  }

  async listAvailable(): Promise<ProviderInfo[]> {
    const results: ProviderInfo[] = []
    const authCtx = await this.buildAuthContext()

    for (const provider of this.providers.values()) {
      try {
        const credentials = await provider.authenticate(authCtx)
        const available = credentials !== null

        results.push({
          id: provider.id,
          name: provider.name,
          url: provider.url,
          available,
          unavailableReason: available ? undefined : "No credentials found",
          capabilities: provider.capabilities(),
          models: available ? await provider.listModels({}) : [],
          defaultModel: undefined, // Set by caller if needed
        })
      } catch (error) {
        results.push({
          id: provider.id,
          name: provider.name,
          url: provider.url,
          available: false,
          unavailableReason: error instanceof Error ? error.message : "Unknown error",
          capabilities: provider.capabilities(),
          models: [],
        })
      }
    }

    return results
  }

  register(provider: ProviderProtocol): void {
    this.providers.set(provider.id, provider)
  }

  unregister(id: string): void {
    this.providers.delete(id)
    this.clearSDKCache(id)
  }

  async loadExternal(npm: string): Promise<ProviderProtocol> {
    try {
      const module = await import(npm)
      const provider = module.default as ProviderProtocol

      if (!this.isValidProvider(provider)) {
        throw new Error("Module does not export a valid ProviderProtocol")
      }

      this.register(provider)
      return provider
    } catch (error) {
      throw new ProviderInitError(
        npm,
        `Failed to load external provider: ${error instanceof Error ? error.message : "Unknown error"}`
      )
    }
  }

  async getSDK(provider: ProviderProtocol): Promise<ProviderSDK> {
    // Check cache
    const cacheKey = this.getSDKCacheKey(provider)
    const cached = this.sdkCache.get(cacheKey)
    if (cached) return cached

    // Get credentials
    const authCtx = await this.buildAuthContext()
    const credentials = await provider.authenticate(authCtx)

    if (!credentials) {
      throw new ProviderInitError(provider.id, "No credentials available")
    }

    // Get SDK options from config
    const config = Config.get()
    const providerConfig = config.provider?.[provider.id]
    const options = {
      baseURL: providerConfig?.baseURL,
      headers: providerConfig?.headers,
      timeout: config.timeout,
    }

    // Initialize SDK
    const sdk = await provider.initializeSDK(credentials, options)

    // Cache and return
    this.sdkCache.set(cacheKey, sdk)
    this.credentialCache.set(provider.id, credentials)

    return sdk
  }

  clearSDKCache(providerID: string): void {
    // Clear all cache entries for this provider
    for (const key of this.sdkCache.keys()) {
      if (key.startsWith(`${providerID}:`)) {
        this.sdkCache.delete(key)
      }
    }
    this.credentialCache.delete(providerID)
  }

  async isAvailable(id: string): Promise<boolean> {
    const provider = this.providers.get(id)
    if (!provider) return false

    try {
      const authCtx = await this.buildAuthContext()
      const credentials = await provider.authenticate(authCtx)
      return credentials !== null
    } catch {
      return false
    }
  }

  private async buildAuthContext(): Promise<AuthContext> {
    return {
      env: process.env as Record<string, string>,
      config: Config.get().provider ?? {},
      authStore: {
        get: async (id) => Auth.get(id),
        set: async (id, creds) => Auth.set(id, creds),
        delete: async (id) => Auth.delete(id),
        list: async () => Auth.list(),
      },
      plugins: await Plugin.list(),
      projectRoot: process.cwd(),
    }
  }

  private getSDKCacheKey(provider: ProviderProtocol): string {
    const credentials = this.credentialCache.get(provider.id)
    const credHash = credentials
      ? Bun.hash(JSON.stringify(credentials)).toString(16)
      : "none"
    return `${provider.id}:${credHash}`
  }

  private isValidProvider(obj: unknown): obj is ProviderProtocol {
    if (typeof obj !== "object" || obj === null) return false
    const p = obj as Partial<ProviderProtocol>
    return (
      typeof p.id === "string" &&
      typeof p.sdk === "string" &&
      typeof p.authenticate === "function" &&
      typeof p.capabilities === "function"
    )
  }
}
```

**Tasks**:
- [ ] Create `registry.ts`
- [ ] Implement SDK caching with credential hashing
- [ ] Implement auth context building
- [ ] Add external provider loading

### 1.5 Model Registry

**File**: `packages/opencode/src/provider/model-registry.ts`

```typescript
import type {
  ModelRegistry as IModelRegistry,
  Model,
  ModelReference,
  ListModelsContext,
} from "./protocol"
import { ModelNotFoundError } from "./errors"
import { Config } from "@/config"
import fuzzysort from "fuzzysort"

// Model priority for sorting
const MODEL_PRIORITY = [
  "gpt-5",
  "gpt-4.1",
  "claude-sonnet-4",
  "claude-opus",
  "gemini-2",
  "o1",
  "o3",
]

export class ModelRegistry implements IModelRegistry {
  private models = new Map<string, Map<string, Model>>()
  private modelsCacheFile = `${process.env.HOME}/.cache/opencode/models.json`
  private lastRefresh = 0
  private refreshInterval = 60 * 60 * 1000 // 1 hour

  async initialize(): Promise<void> {
    await this.loadFromCache()
    this.scheduleRefresh()
  }

  get(providerID: string, modelID: string): Model | undefined {
    return this.models.get(providerID)?.get(modelID)
  }

  getOrThrow(providerID: string, modelID: string): Model {
    const model = this.get(providerID, modelID)
    if (!model) {
      const suggestions = this.getSuggestions(providerID, modelID)
      throw new ModelNotFoundError(providerID, modelID, suggestions)
    }
    return model
  }

  list(providerID?: string): Model[] {
    if (providerID) {
      return Array.from(this.models.get(providerID)?.values() ?? [])
    }
    const all: Model[] = []
    for (const providerModels of this.models.values()) {
      all.push(...providerModels.values())
    }
    return all
  }

  async refresh(): Promise<void> {
    try {
      const response = await fetch("https://models.dev/api.json")
      const data = await response.json()

      // Clear and repopulate
      this.models.clear()

      for (const [providerID, providerData] of Object.entries(data.providers)) {
        const providerModels = new Map<string, Model>()
        const pd = providerData as { models: Record<string, any> }

        for (const [modelID, modelData] of Object.entries(pd.models)) {
          providerModels.set(modelID, this.normalizeModel(providerID, modelID, modelData))
        }

        this.models.set(providerID, providerModels)
      }

      // Apply config overrides
      this.applyConfigOverrides()

      // Save to cache
      await this.saveToCache()

      this.lastRefresh = Date.now()
    } catch (error) {
      console.error("Failed to refresh models:", error)
      // Keep existing data if refresh fails
    }
  }

  parse(modelString: string): ModelReference {
    const parts = modelString.split("/")
    if (parts.length === 2) {
      return { providerID: parts[0], modelID: parts[1] }
    }
    // Try to infer provider from model ID
    for (const [providerID, models] of this.models) {
      if (models.has(modelString)) {
        return { providerID, modelID: modelString }
      }
    }
    // Default to configured default provider
    const config = Config.get()
    const defaultProvider = config.model?.split("/")[0] ?? "anthropic"
    return { providerID: defaultProvider, modelID: modelString }
  }

  sort(models: Model[]): Model[] {
    return [...models].sort((a, b) => {
      const aPriority = this.getModelPriority(a)
      const bPriority = this.getModelPriority(b)
      if (aPriority !== bPriority) return aPriority - bPriority
      // Secondary sort by name
      return a.name.localeCompare(b.name)
    })
  }

  closest(providerID: string, queries: string[]): Model | undefined {
    const models = this.list(providerID)
    if (models.length === 0) return undefined

    const targets = models.map((m) => ({
      model: m,
      searchable: `${m.id} ${m.name} ${m.family}`,
    }))

    for (const query of queries) {
      const results = fuzzysort.go(query, targets, {
        key: "searchable",
        threshold: -10000,
      })
      if (results.length > 0) {
        return results[0].obj.model
      }
    }

    return undefined
  }

  default(): Model {
    const config = Config.get()
    const modelString = config.model ?? "anthropic/claude-sonnet-4"
    const { providerID, modelID } = this.parse(modelString)
    return this.getOrThrow(providerID, modelID)
  }

  small(providerID: string): Model {
    const config = Config.get()

    // Check config for small model override
    if (config.small_model) {
      const { providerID: smallProvider, modelID } = this.parse(config.small_model)
      if (smallProvider === providerID) {
        const model = this.get(providerID, modelID)
        if (model) return model
      }
    }

    // Find cheapest model for provider
    const models = this.list(providerID)
    const sorted = models.sort((a, b) => a.cost.input - b.cost.input)
    return sorted[0] ?? this.default()
  }

  registerOverride(
    providerID: string,
    modelID: string,
    overrides: Partial<Model>
  ): void {
    const existing = this.get(providerID, modelID)
    if (!existing) return

    const merged = { ...existing, ...overrides }
    this.models.get(providerID)?.set(modelID, merged)
  }

  private normalizeModel(
    providerID: string,
    modelID: string,
    data: any
  ): Model {
    return {
      id: modelID,
      providerID,
      name: data.name ?? modelID,
      family: data.family ?? "unknown",
      status: data.status ?? "active",
      capabilities: {
        reasoning: data.reasoning ?? false,
        temperature: data.temperature ?? true,
        toolCall: data.tool_call ?? true,
        attachment: data.attachment ?? false,
        structuredOutput: data.structured_output ?? true,
        streaming: data.streaming ?? true,
        systemMessage: data.system_message ?? true,
        multiTurn: data.multi_turn ?? true,
      },
      modalities: {
        input: data.modalities?.input ?? ["text"],
        output: data.modalities?.output ?? ["text"],
      },
      limits: {
        context: data.limit?.context ?? 128000,
        output: data.limit?.output ?? 4096,
        reasoning: data.limit?.reasoning,
      },
      cost: {
        input: data.cost?.input ?? 0,
        output: data.cost?.output ?? 0,
        cachedInput: data.cost?.cached_input,
        reasoning: data.cost?.reasoning,
      },
      api: {
        npm: data.api?.npm ?? `@ai-sdk/${providerID}`,
        baseURL: data.api?.base_url,
        version: data.api?.version,
      },
      aliases: data.aliases,
      releaseDate: data.release_date,
    }
  }

  private getModelPriority(model: Model): number {
    for (let i = 0; i < MODEL_PRIORITY.length; i++) {
      if (model.id.includes(MODEL_PRIORITY[i])) return i
    }
    return MODEL_PRIORITY.length
  }

  private getSuggestions(providerID: string, query: string): string[] {
    const models = this.list(providerID)
    const results = fuzzysort.go(query, models, {
      key: "id",
      limit: 3,
      threshold: -10000,
    })
    return results.map((r) => r.obj.id)
  }

  private applyConfigOverrides(): void {
    const config = Config.get()
    if (!config.provider) return

    for (const [providerID, providerConfig] of Object.entries(config.provider)) {
      if (!providerConfig.models) continue

      for (const [modelID, modelOverrides] of Object.entries(providerConfig.models)) {
        this.registerOverride(providerID, modelID, modelOverrides as Partial<Model>)
      }
    }
  }

  private async loadFromCache(): Promise<void> {
    try {
      const file = Bun.file(this.modelsCacheFile)
      if (await file.exists()) {
        const data = await file.json()
        // Populate from cache
        for (const [providerID, models] of Object.entries(data)) {
          const providerModels = new Map<string, Model>()
          for (const [modelID, model] of Object.entries(models as Record<string, Model>)) {
            providerModels.set(modelID, model)
          }
          this.models.set(providerID, providerModels)
        }
      }
    } catch {
      // Cache doesn't exist or is invalid, will refresh
    }
  }

  private async saveToCache(): Promise<void> {
    const data: Record<string, Record<string, Model>> = {}
    for (const [providerID, models] of this.models) {
      data[providerID] = Object.fromEntries(models)
    }
    await Bun.write(this.modelsCacheFile, JSON.stringify(data, null, 2))
  }

  private scheduleRefresh(): void {
    setInterval(() => {
      if (Date.now() - this.lastRefresh > this.refreshInterval) {
        this.refresh()
      }
    }, this.refreshInterval)
  }
}
```

**Tasks**:
- [ ] Create `model-registry.ts`
- [ ] Port model fetching from `models.ts`
- [ ] Implement fuzzy search with fuzzysort
- [ ] Add config override support

### 1.6 Router

**File**: `packages/opencode/src/provider/router.ts`

```typescript
import type {
  ProviderRouter as IProviderRouter,
  ProviderProtocol,
  RouteContext,
  RoutingStrategy,
} from "./protocol"
import { CapabilityRoutingStrategy } from "./strategies/capability"

export class ProviderRouter implements IProviderRouter {
  private strategy: RoutingStrategy
  private registry: { list(): ProviderProtocol[]; isAvailable(id: string): Promise<boolean> }

  constructor(
    registry: { list(): ProviderProtocol[]; isAvailable(id: string): Promise<boolean> },
    strategy?: RoutingStrategy
  ) {
    this.registry = registry
    this.strategy = strategy ?? new CapabilityRoutingStrategy()
  }

  route(ctx: RouteContext): ProviderProtocol {
    const available = this.getAvailableProviders(ctx)
    if (available.length === 0) {
      throw new Error("No providers available for request")
    }
    return this.strategy.select(ctx, available)
  }

  fallback(
    ctx: RouteContext,
    failed: ProviderProtocol,
    error: Error
  ): ProviderProtocol | null {
    const available = this.getAvailableProviders(ctx).filter(
      (p) => p.id !== failed.id
    )
    if (available.length === 0) return null
    return this.strategy.selectFallback(ctx, failed, error, available)
  }

  setStrategy(strategy: RoutingStrategy): void {
    this.strategy = strategy
  }

  getStrategy(): RoutingStrategy {
    return this.strategy
  }

  private getAvailableProviders(ctx: RouteContext): ProviderProtocol[] {
    let providers = this.registry.list()

    // Filter by explicit hint
    if (ctx.providerHint) {
      const hinted = providers.find((p) => p.id === ctx.providerHint)
      if (hinted) return [hinted]
    }

    // Filter by preferences
    if (ctx.preferences?.blockedProviders) {
      const blocked = new Set(ctx.preferences.blockedProviders)
      providers = providers.filter((p) => !blocked.has(p.id))
    }

    // Filter by required modalities
    if (ctx.modalities.size > 0) {
      providers = providers.filter((p) => {
        const caps = p.capabilities()
        return [...ctx.modalities].every((m) => caps.modalities.input.includes(m))
      })
    }

    return providers
  }
}
```

**File**: `packages/opencode/src/provider/strategies/capability.ts`

```typescript
import type {
  RoutingStrategy,
  ProviderProtocol,
  RouteContext,
  TaskType,
} from "../protocol"

const TASK_PROVIDER_AFFINITY: Record<TaskType, string[]> = {
  reasoning: ["anthropic", "openai", "google"],
  code: ["anthropic", "openai", "github-copilot"],
  vision: ["openai", "google", "anthropic"],
  summarization: ["groq", "cerebras", "anthropic"],
  extraction: ["openai", "anthropic"],
  conversation: ["anthropic", "openai", "google"],
  embedding: ["openai", "google"],
  "sub-task": ["groq", "cerebras", "anthropic"],
}

export class CapabilityRoutingStrategy implements RoutingStrategy {
  readonly name = "capability"

  select(ctx: RouteContext, available: ProviderProtocol[]): ProviderProtocol {
    // Score each provider
    const scored = available.map((p) => ({
      provider: p,
      score: this.score(p, ctx),
    }))

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)

    return scored[0].provider
  }

  selectFallback(
    ctx: RouteContext,
    _failed: ProviderProtocol,
    _error: Error,
    remaining: ProviderProtocol[]
  ): ProviderProtocol | null {
    if (remaining.length === 0) return null
    return this.select(ctx, remaining)
  }

  private score(provider: ProviderProtocol, ctx: RouteContext): number {
    let score = 0
    const caps = provider.capabilities()

    // Task affinity
    const affinity = TASK_PROVIDER_AFFINITY[ctx.task] ?? []
    const affinityIndex = affinity.indexOf(provider.id)
    if (affinityIndex >= 0) {
      score += (affinity.length - affinityIndex) * 10
    }

    // Reasoning support for reasoning tasks
    if (ctx.task === "reasoning" && caps.reasoning !== "none") {
      score += 20
    }

    // Caching support
    if (caps.caching) {
      score += 5
    }

    // Preference boost
    if (ctx.preferences?.preferredProviders?.includes(provider.id)) {
      score += 50
    }

    return score
  }
}
```

**Tasks**:
- [ ] Create `router.ts`
- [ ] Create `strategies/capability.ts`
- [ ] Create `strategies/index.ts`

### 1.7 Instance Module

**File**: `packages/opencode/src/provider/instance.ts`

```typescript
import { ProviderRegistry } from "./registry"
import { ModelRegistry } from "./model-registry"
import { ProviderRouter } from "./router"
import { registerBundledProviders } from "./providers"

// Singleton instances
let _registry: ProviderRegistry | null = null
let _models: ModelRegistry | null = null
let _router: ProviderRouter | null = null

export function getRegistry(): ProviderRegistry {
  if (!_registry) {
    _registry = new ProviderRegistry()
    registerBundledProviders(_registry)
  }
  return _registry
}

export function getModels(): ModelRegistry {
  if (!_models) {
    _models = new ModelRegistry()
  }
  return _models
}

export function getRouter(): ProviderRouter {
  if (!_router) {
    _router = new ProviderRouter(getRegistry())
  }
  return _router
}

// Convenience exports
export const registry = { get current() { return getRegistry() } }
export const models = { get current() { return getModels() } }
export const router = { get current() { return getRouter() } }

// Initialize all singletons
export async function initialize(): Promise<void> {
  await getModels().initialize()
}
```

**Tasks**:
- [ ] Create `instance.ts`
- [ ] Wire up singleton initialization

### 1.8 Public Index

**File**: `packages/opencode/src/provider/index.ts`

```typescript
// Protocol types
export type {
  ProviderProtocol,
  ProviderCapabilities,
  ProviderDefaults,
  ProviderOptions,
  NamespacedOptions,
  Model,
  ModelCapabilities,
  ModelModalities,
  ModelMessage,
  ContentPart,
  RouteContext,
  TaskType,
  VariantConfig,
} from "./protocol"

// Errors
export {
  ModelNotFoundError,
  ProviderInitError,
  AuthenticationError,
  CapabilityNotSupportedError,
} from "./errors"

// Base class for custom providers
export { BaseProvider } from "./base"

// Singleton accessors
export { getRegistry, getModels, getRouter, initialize } from "./instance"

// Convenience re-exports
export { registry, models, router } from "./instance"
```

**Tasks**:
- [ ] Create `index.ts` with public exports
- [ ] Verify all needed types are exported

---

## Phase 2: Provider Implementation

### 2.1 Provider Registration

**File**: `packages/opencode/src/provider/providers/index.ts`

```typescript
import type { ProviderRegistry } from "../registry"

import { AnthropicProvider } from "./anthropic"
import { OpenAIProvider } from "./openai"
import { AmazonBedrockProvider } from "./amazon-bedrock"
import { AzureProvider } from "./azure"
import { AzureCognitiveProvider } from "./azure-cognitive"
import { GoogleProvider } from "./google"
import { GoogleVertexProvider } from "./google-vertex"
import { GoogleVertexAnthropicProvider } from "./google-vertex-anthropic"
import { GitHubCopilotProvider } from "./github-copilot"
import { GitHubCopilotEnterpriseProvider } from "./github-copilot-enterprise"
import { OpenRouterProvider } from "./openrouter"
import { CloudflareProvider } from "./cloudflare"
import { CerebrasProvider } from "./cerebras"
import { GroqProvider } from "./groq"
import { MistralProvider } from "./mistral"
import { OpenCodeProvider } from "./opencode"

export function registerBundledProviders(registry: ProviderRegistry): void {
  registry.register(new AnthropicProvider())
  registry.register(new OpenAIProvider())
  registry.register(new AmazonBedrockProvider())
  registry.register(new AzureProvider())
  registry.register(new AzureCognitiveProvider())
  registry.register(new GoogleProvider())
  registry.register(new GoogleVertexProvider())
  registry.register(new GoogleVertexAnthropicProvider())
  registry.register(new GitHubCopilotProvider())
  registry.register(new GitHubCopilotEnterpriseProvider())
  registry.register(new OpenRouterProvider())
  registry.register(new CloudflareProvider())
  registry.register(new CerebrasProvider())
  registry.register(new GroqProvider())
  registry.register(new MistralProvider())
  registry.register(new OpenCodeProvider())
}
```

### 2.2 Individual Provider Implementations

Each provider follows this template. Below are the key implementations.

#### Anthropic

**File**: `packages/opencode/src/provider/providers/anthropic.ts`

```typescript
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
} from "../protocol"

export class AnthropicProvider extends BaseProvider {
  readonly id = "anthropic"
  readonly sdk = "@ai-sdk/anthropic"
  readonly name = "Anthropic"
  readonly url = "https://anthropic.com"

  async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    // 1. Environment variable
    const apiKey = ctx.env.ANTHROPIC_API_KEY
    if (apiKey) return { apiKey }

    // 2. Auth store
    const stored = await ctx.authStore.get("anthropic")
    if (stored?.apiKey) return { apiKey: stored.apiKey }

    // 3. OAuth plugin
    const plugin = ctx.plugins.find((p) => p.id === "opencode-anthropic-auth")
    if (plugin?.auth?.loader) {
      return plugin.auth.loader(ctx)
    }

    return null
  }

  async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    // Models are fetched from models.dev, not listed here
    return []
  }

  normalizeMessages(messages: ModelMessage[], _model: Model): ModelMessage[] {
    return messages
      .filter((m) => this.hasContent(m))
      .map((m) => this.filterEmptyParts(m))
      .map((m) => this.sanitizeToolIds(m))
  }

  private hasContent(m: ModelMessage): boolean {
    if (typeof m.content === "string") return m.content.length > 0
    return m.content.some((p) => {
      if (p.type === "text") return p.text.length > 0
      if (p.type === "reasoning") return p.reasoning.length > 0
      return true
    })
  }

  private sanitizeToolIds(m: ModelMessage): ModelMessage {
    return this.mapToolCallIds(m, (id) =>
      id.replace(/[^a-zA-Z0-9_-]/g, "_")
    )
  }

  buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    // Apply caching if supported
    if (this.supportsCaching() && ctx.sessionID) {
      options.caching = { enabled: true, type: "ephemeral" }
    }

    return options
  }

  wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { anthropic: options }
  }

  capabilities(): ProviderCapabilities {
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

  variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []
    return [
      {
        name: "high",
        label: "Extended Thinking",
        options: { reasoning: { budgetTokens: 16000 } },
      },
      {
        name: "max",
        label: "Maximum Thinking",
        options: { reasoning: { budgetTokens: 31999 } },
      },
    ]
  }

  applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    return this.applyCacheMarkers(messages, {
      systemCount: 2,
      tailCount: 2,
      cacheControl: { type: "ephemeral" },
    })
  }

  getHeaders(_ctx: HeaderContext): Record<string, string> {
    return {
      "anthropic-beta":
        "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
    }
  }
}
```

#### OpenAI

**File**: `packages/opencode/src/provider/providers/openai.ts`

```typescript
import { BaseProvider } from "../base"
import type {
  AuthContext,
  Credentials,
  ProviderCapabilities,
  ProviderOptions,
  NamespacedOptions,
  OptionsContext,
  ListModelsContext,
  Model,
  VariantConfig,
  ProviderSDK,
  ModelOptions,
} from "../protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"

export class OpenAIProvider extends BaseProvider {
  readonly id = "openai"
  readonly sdk = "@ai-sdk/openai"
  readonly name = "OpenAI"
  readonly url = "https://openai.com"

  async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    const apiKey = ctx.env.OPENAI_API_KEY
    if (apiKey) return { apiKey }

    const stored = await ctx.authStore.get("openai")
    if (stored?.apiKey) return { apiKey: stored.apiKey }

    return null
  }

  async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  // Override to use responses API
  getModel(
    sdk: ProviderSDK,
    modelID: string,
    _options?: ModelOptions
  ): LanguageModelV2 {
    if (typeof sdk.responses === "function") {
      return sdk.responses(modelID)
    }
    return super.getModel(sdk, modelID, _options)
  }

  buildOptions(ctx: OptionsContext): ProviderOptions {
    const options = super.buildOptions(ctx)

    // Add session caching
    if (ctx.sessionID) {
      options.promptCacheKey = ctx.sessionID
    }

    return options
  }

  wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { openai: options }
  }

  capabilities(): ProviderCapabilities {
    return {
      caching: true,
      reasoning: "effort",
      modalities: { input: ["text", "image", "audio"], output: ["text", "audio"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }

  variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []
    return [
      { name: "low", options: { reasoning: { effort: "low" } } },
      { name: "medium", options: { reasoning: { effort: "medium" } } },
      { name: "high", options: { reasoning: { effort: "high" } } },
      {
        name: "xhigh",
        options: {
          reasoning: {
            effort: "high",
            summary: "auto",
          },
        },
      },
    ]
  }
}
```

#### Mistral (with message sequence repair)

**File**: `packages/opencode/src/provider/providers/mistral.ts`

```typescript
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

export class MistralProvider extends BaseProvider {
  readonly id = "mistral"
  readonly sdk = "@ai-sdk/mistral"
  readonly name = "Mistral"
  readonly url = "https://mistral.ai"

  async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    const apiKey = ctx.env.MISTRAL_API_KEY
    if (apiKey) return { apiKey }

    const stored = await ctx.authStore.get("mistral")
    if (stored?.apiKey) return { apiKey: stored.apiKey }

    return null
  }

  async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  normalizeMessages(messages: ModelMessage[], _model: Model): ModelMessage[] {
    // 1. Normalize tool IDs to exactly 9 alphanumeric chars
    let normalized = messages.map((m) =>
      this.mapToolCallIds(m, (id) => this.normalizeToolId(id))
    )

    // 2. Fix tool→user sequence (insert assistant message)
    normalized = this.fixToolUserSequence(normalized)

    return normalized
  }

  private normalizeToolId(id: string): string {
    // Strip non-alphanumeric, pad/truncate to 9 chars
    const alphanumeric = id.replace(/[^a-zA-Z0-9]/g, "")
    if (alphanumeric.length >= 9) {
      return alphanumeric.slice(0, 9)
    }
    return alphanumeric.padEnd(9, "0")
  }

  private fixToolUserSequence(messages: ModelMessage[]): ModelMessage[] {
    const result: ModelMessage[] = []

    for (let i = 0; i < messages.length; i++) {
      const current = messages[i]
      const prev = result[result.length - 1]

      // If previous was tool and current is user, insert assistant
      if (prev?.role === "tool" && current.role === "user") {
        result.push({
          role: "assistant",
          content: "Done.",
        })
      }

      result.push(current)
    }

    return result
  }

  wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { mistral: options }
  }

  capabilities(): ProviderCapabilities {
    return {
      caching: false,
      reasoning: "none",
      modalities: { input: ["text"], output: ["text"] },
      authentication: ["api_key"],
      streaming: true,
      toolCalling: true,
      structuredOutput: true,
    }
  }
}
```

#### Amazon Bedrock (complex auth)

**File**: `packages/opencode/src/provider/providers/amazon-bedrock.ts`

```typescript
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
} from "../protocol"
import type { LanguageModelV2 } from "@ai-sdk/provider"

const REGION_PREFIXES: Record<string, string> = {
  "us-east-1": "us.",
  "us-west-2": "us.",
  "eu-west-1": "eu.",
  "eu-west-3": "eu.",
  "ap-northeast-1": "jp.",
  "ap-southeast-2": "au.",
  "ap-south-1": "apac.",
}

export class AmazonBedrockProvider extends BaseProvider {
  readonly id = "amazon-bedrock"
  readonly sdk = "@ai-sdk/amazon-bedrock"
  readonly name = "Amazon Bedrock"
  readonly url = "https://aws.amazon.com/bedrock"

  autoload(env: Record<string, string | undefined>): boolean {
    // Auto-load if AWS credentials are available
    return !!(
      env.AWS_ACCESS_KEY_ID ||
      env.AWS_PROFILE ||
      env.AWS_BEARER_TOKEN_BEDROCK
    )
  }

  async authenticate(ctx: AuthContext): Promise<Credentials | null> {
    const region = ctx.env.AWS_REGION ?? ctx.env.AWS_DEFAULT_REGION ?? "us-east-1"

    // Bearer token path
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

  async initializeSDK(
    credentials: Credentials,
    options: SDKOptions
  ): Promise<ProviderSDK> {
    const sdkModule = await import(this.sdk)
    const { fromNodeProviderChain } = await import("@aws-sdk/credential-providers")

    const bedrockOptions = credentials.custom?.bedrockOptions ?? {}
    const region = credentials.aws?.region ?? "us-east-1"

    return sdkModule.createAmazonBedrock({
      region,
      credentialProvider: fromNodeProviderChain(),
      ...bedrockOptions,
      ...options,
    })
  }

  getModel(
    sdk: ProviderSDK,
    modelID: string,
    _options?: ModelOptions
  ): LanguageModelV2 {
    // Add region prefix for cross-region inference
    const prefixedID = this.addRegionPrefix(modelID)
    return super.getModel(sdk, prefixedID, _options)
  }

  private addRegionPrefix(modelID: string): string {
    const region = process.env.AWS_REGION ?? "us-east-1"
    const prefix = REGION_PREFIXES[region] ?? "us."

    // Don't double-prefix
    if (Object.values(REGION_PREFIXES).some((p) => modelID.startsWith(p))) {
      return modelID
    }

    return `${prefix}${modelID}`
  }

  async listModels(_ctx: ListModelsContext): Promise<Model[]> {
    return []
  }

  applyCaching(messages: ModelMessage[], _sessionID: string): ModelMessage[] {
    return this.applyCacheMarkers(messages, {
      systemCount: 2,
      tailCount: 2,
      cacheControl: { type: "ephemeral" },
    })
  }

  wrapOptions(options: ProviderOptions): NamespacedOptions {
    return { bedrock: options }
  }

  capabilities(): ProviderCapabilities {
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

  variants(model: Model): VariantConfig[] {
    if (!model.capabilities.reasoning) return []
    return [
      {
        name: "low",
        options: {
          reasoning: { effort: "low" },
        },
      },
      {
        name: "medium",
        options: {
          reasoning: { effort: "medium" },
        },
      },
      {
        name: "high",
        options: {
          reasoning: { effort: "high" },
        },
      },
    ]
  }
}
```

### 2.3 Remaining Providers

Create implementations for:

- [ ] `azure.ts` - Port from CUSTOM_LOADERS.azure
- [ ] `azure-cognitive.ts` - Port URL construction logic
- [ ] `google.ts` - Port thinkingConfig and schema sanitization
- [ ] `google-vertex.ts` - Port ADC handling
- [ ] `google-vertex-anthropic.ts` - Subpath import handling
- [ ] `github-copilot.ts` - OAuth plugin + dual routing
- [ ] `github-copilot-enterprise.ts` - Enterprise variant
- [ ] `openrouter.ts` - Multi-model gateway + headers
- [ ] `cloudflare.ts` - Custom fetch + header stripping
- [ ] `cerebras.ts` - Custom header
- [ ] `groq.ts` - Thinking config
- [ ] `opencode.ts` - Internal provider

### 2.4 Provider Test Suite

**File**: `packages/opencode/src/provider/providers/__tests__/{provider}.test.ts`

Each provider needs:
- [ ] Unit tests for `authenticate()`
- [ ] Unit tests for `normalizeMessages()`
- [ ] Unit tests for `buildOptions()`
- [ ] Unit tests for `variants()`
- [ ] Golden test comparison

---

## Phase 3: Consumer Updates

### 3.1 Import Mapping

| Old Import | New Import |
|------------|------------|
| `import { Provider } from "@/provider/provider"` | `import { registry, models } from "@/provider"` |
| `import { ProviderTransform } from "@/provider/transform"` | `import { registry } from "@/provider"` |
| `import { ProviderAuth } from "@/provider/auth"` | `import { ProviderAuth } from "@/provider/auth"` (unchanged) |
| `import { ModelsDev } from "@/provider/models"` | `import { models } from "@/provider"` |

### 3.2 Function Mapping

| Old Function | New Pattern |
|--------------|-------------|
| `Provider.getModel(pID, mID)` | `models.getOrThrow(pID, mID)` |
| `Provider.getLanguage(model)` | `registry.getSDK(provider).then(sdk => provider.getModel(sdk, model.id))` |
| `Provider.getProvider(pID)` | `registry.get(pID)` |
| `Provider.list()` | `registry.listAvailable()` |
| `Provider.defaultModel()` | `models.default()` |
| `Provider.getSmallModel(pID)` | `models.small(pID)` |
| `Provider.parseModel(str)` | `models.parse(str)` |
| `Provider.sort(modelList)` | `models.sort(modelList)` |
| `Provider.closest(pID, queries)` | `models.closest(pID, queries)` |
| `ProviderTransform.message(msgs, model)` | `provider.normalizeMessages(msgs, model)` |
| `ProviderTransform.options(model, sid, opts)` | `provider.buildOptions({ model, sessionID: sid, userOptions: opts })` |
| `ProviderTransform.variants(model)` | `provider.variants(model)` |
| `ProviderTransform.providerOptions(model, opts)` | `provider.wrapOptions(opts)` |
| `ProviderTransform.schema(model, schema)` | `provider.transformSchema(schema, model)` |
| `ProviderTransform.error(pID, err)` | `provider.transformError(err)` |
| `ProviderTransform.temperature(model)` | `provider.defaults().temperature` |
| `ModelsDev.refresh()` | `models.refresh()` |
| `ModelsDev.get()` | `models.list()` |

### 3.3 Consumer File Updates

#### session/llm.ts

```typescript
// Before
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"

const language = await Provider.getLanguage(input.model)
const provider = Provider.getProvider(input.model.providerID)
const options = ProviderTransform.options(input.model, input.sessionID, provider.options)
const messages = ProviderTransform.message(args.params.prompt, input.model)

// After
import { registry, models } from "@/provider"

const provider = registry.getOrThrow(input.model.providerID)
const sdk = await registry.getSDK(provider)
const language = provider.getModel(sdk, input.model.id)
const options = provider.buildOptions({
  model: input.model,
  sessionID: input.sessionID
})
const messages = provider.normalizeMessages(args.params.prompt, input.model)
```

#### session/prompt.ts

```typescript
// Before
import { Provider } from "../provider/provider"
import { ProviderTransform } from "../provider/transform"

const model = Provider.getModel(providerID, modelID)
const schema = ProviderTransform.schema(input.model, rawSchema)

// After
import { registry, models } from "@/provider"

const model = models.getOrThrow(providerID, modelID)
const provider = registry.getOrThrow(model.providerID)
const schema = provider.transformSchema(rawSchema, model)
```

#### server/server.ts

```typescript
// Before
import { Provider } from "../provider/provider"
import { ModelsDev } from "../provider/models"

const providers = await Provider.list()
const all = await ModelsDev.get()

// After
import { registry, models } from "@/provider"

const providers = await registry.listAvailable()
const all = models.list()
```

### 3.4 Error Handling Updates

```typescript
// Before
import { Provider } from "@/provider/provider"

try {
  const model = Provider.getModel(pID, mID)
} catch (e) {
  if (Provider.ModelNotFoundError.isInstance(e)) {
    // handle
  }
}

// After
import { models, ModelNotFoundError } from "@/provider"

try {
  const model = models.getOrThrow(pID, mID)
} catch (e) {
  if (ModelNotFoundError.isInstance(e)) {
    // handle
  }
}
```

---

## Phase 4: Cutover & Cleanup

### 4.1 Pre-Cutover Checklist

- [ ] All golden tests pass
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing of each provider
- [ ] Performance benchmarks within tolerance
- [ ] Rollback procedure documented

### 4.2 Cutover Steps

```bash
# 1. Final test run
bun test

# 2. Merge feature branch
git checkout dev
git merge feature/provider-protocol-v2

# 3. Remove old files
rm packages/opencode/src/provider/provider.ts
rm packages/opencode/src/provider/transform.ts
rm packages/opencode/src/provider/models.ts
rm packages/opencode/src/provider/models-macro.ts

# 4. Build and verify
bun run build
bun test

# 5. Tag release
git tag -a v2.0.0-provider-protocol -m "Provider protocol migration complete"
```

### 4.3 Post-Cutover Monitoring

- [ ] Monitor error rates for 24 hours
- [ ] Monitor latency metrics
- [ ] Check all provider authentication paths
- [ ] Verify caching behavior
- [ ] Confirm model resolution works

### 4.4 Cleanup Tasks

- [ ] Remove migration documentation (or archive)
- [ ] Update CONTEXT.md with new architecture
- [ ] Update API documentation
- [ ] Remove golden test snapshots (replace with new baseline)

---

## Deliverables Summary

| Phase | Files Created | Lines (Est.) |
|-------|---------------|--------------|
| 0 | golden.test.ts | ~200 |
| 1 | protocol.ts, errors.ts, base.ts, registry.ts, model-registry.ts, router.ts, instance.ts, index.ts, strategies/* | ~2,200 |
| 2 | providers/* (16 files) | ~2,100 |
| 3 | Consumer updates (16 files) | ~500 net change |
| 4 | Deletions | -2,000 |
| **Total** | ~25 new files | ~3,000 net |

---

## Success Criteria

### Functional
- [ ] All 14 providers authenticate correctly
- [ ] All message normalization behaviors preserved
- [ ] All variant configurations work
- [ ] All caching behaviors preserved
- [ ] Golden tests pass 100%

### Performance
- [ ] SDK initialization: < 100ms
- [ ] Model resolution: < 10ms
- [ ] Message normalization: < 5ms per message

### Code Quality
- [ ] No circular dependencies
- [ ] 80%+ test coverage
- [ ] All public APIs documented
- [ ] Clean separation of concerns
