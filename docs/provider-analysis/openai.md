# OpenAI Provider Analysis

## Overview
The OpenAI provider integrates GPT models through a custom loader that delegates model instantiation to the `sdk.responses()` method instead of the standard `sdk.languageModel()` approach. This design enables support for OpenAI's specialized Responses API which provides access to advanced features like structured outputs, reasoning models (o1/o3 series), prompt caching, and cost-optimized inference. The provider implements release-date-aware reasoning variant support, dynamic reasoning effort configuration based on model capabilities, and session-based prompt cache keys for cost reduction.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 50, 108-116 | SDK bundled provider registration (@ai-sdk/openai) and custom loader using sdk.responses() |
| `packages/opencode/src/provider/transform.ts` | 317-343, 457-459, 470-489, 514-518, 493-498 | Reasoning variants by release date, promptCacheKey configuration, model-specific options, provider wrapper |
| `packages/opencode/src/session/llm.ts` | 55, 89, 158, 184-198 | LLM streaming, options merge, middleware wrapping, param transformation |
| `packages/opencode/src/provider/sdk/openai-compatible/src/openai-compatible-provider.ts` | 38-95 | Provider interface with responses() method supporting Responses API |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/sdk/openai-compatible/src/responses/openai-responses-language-model.ts` | 131-150+ | LanguageModelV2 implementation for Responses API with specialized tool/format handling |
| `packages/console/app/src/routes/zen/util/provider/openai.ts` | - | Protocol translation and usage parsing |
| `packages/opencode/src/provider/auth.ts` | 10-143 | Authentication method registration |

## Design

### SDK Integration
The OpenAI provider is registered as a bundled provider at line 50 of provider.ts:
```typescript
"@ai-sdk/openai": createOpenAI
```

However, unlike most providers that use the default `sdk.languageModel()` method, OpenAI employs a custom model loader (lines 108-116) that routes to `sdk.responses()` instead:
```typescript
openai: async () => {
  return {
    autoload: false,
    async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
      return sdk.responses(modelID)
    },
    options: {},
  }
}
```

**Why `sdk.responses()` instead of `sdk.languageModel()`?**
- The Responses API is OpenAI's next-generation inference endpoint supporting reasoning models (o1, o3), structured outputs, and prompt caching
- Provides access to extended thinking tokens and cost-optimized inference
- Standard chat completions API has limitations OpenAI is moving beyond
- `sdk.responses()` provides the LanguageModelV2 interface adapted to Responses API specifications

### Custom Loader
The custom loader at lines 108-116 performs minimal configuration:
- `autoload: false` - Requires explicit API key configuration (env or config file)
- `getModel()` - Intercepts model instantiation to use `sdk.responses()` instead of default chat endpoint
- `options: {}` - No SDK-level overrides; configuration flows through model options

The loader is triggered during provider state initialization (provider.ts:811-821) when OpenAI is present in the database.

### Configuration
**Environment Variables:**
- `OPENAI_API_KEY` - Primary authentication source (checked via provider.env list)

**Config File Options:**
```
provider:
  openai:
    apiKey: "sk-..."
    baseURL: "https://api.openai.com/v1"  # Optional override
    timeout: 30000  # Request timeout in milliseconds
```

**Authentication Methods:**
1. Environment variable (`OPENAI_API_KEY`)
2. Config file (`opencode.json`)
3. Direct API key via CLI auth command
4. OAuth plugin (if available)

## Interfaces

### Provider Options Schema
```typescript
// OpenAI provider options passed through custom loader
{
  apiKey: string  // API authentication key (required)
  baseURL: string  // Optional custom endpoint (defaults to https://api.openai.com/v1)
  timeout: number | false  // Request timeout in milliseconds
  headers?: Record<string, string>  // Custom headers (merged at runtime)
  fetch?: FetchFunction  // Custom fetch implementation
}
```

### Model Configuration
OpenAI models support reasoning variants based on release date and model family:

```typescript
variants: {
  // For models released >= 2025-11-13: "none" reasoning support
  none: {
    reasoningEffort: "none",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"]
  },

  // For gpt-5-* models and newer: "minimal" reasoning support
  minimal: {
    reasoningEffort: "minimal",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"]
  },

  // Standard reasoning levels: low, medium, high
  low: {
    reasoningEffort: "low",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"]
  },
  medium: {
    reasoningEffort: "medium",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"]
  },
  high: {
    reasoningEffort: "high",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"]
  },

  // For models released >= 2025-12-04: "xhigh" reasoning support
  xhigh: {
    reasoningEffort: "xhigh",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"]
  }
}
```

Models must have `capabilities.reasoning: true` to support variants.

## Process Flows

### Initialization Flow
```
1. Provider.list() called
   ↓
2. Database built from models.dev
   ↓
3. Custom loaders executed (provider.ts:811-821)
   ↓
4. openai() custom loader triggered
   ↓
5. Custom getModel() registered for sdk.responses() routing
   ↓
6. Provider marked as "custom" source
   ↓
7. Provider available if API key exists (env/config/auth)
```

### Model Loading Flow
```
1. Provider.getLanguage() called with OpenAI model
   ↓
2. Provider.getSDK() instantiates SDK with createOpenAI()
   ↓
3. Custom loader's getModel() called by AI SDK adapter
   ↓
4. sdk.responses(modelID) invoked
   ↓
5. OpenAIResponsesLanguageModel instantiated
   ↓
6. LanguageModelV2 interface returned for use in streamText()
```

### Request Flow
```
1. User message → LLM.stream() (llm.ts:43)
   ↓
2. System prompt selected
   ↓
3. Messages + system assembled (llm.ts:57-82)
   ↓
4. ProviderTransform.options() applied (llm.ts:88-94, transform.ts:457-459)
   ├─ promptCacheKey set to sessionID if model.providerID === "openai"
   └─ Model-specific options merged
   ↓
5. Variants applied based on user.variant selection (llm.ts:86-94)
   ├─ Reasoning effort determined by model and release date
   └─ include: ["reasoning.encrypted_content"] for encrypted reasoning
   ↓
6. Provider.getLanguage() retrieves OpenAI SDK instance
   ↓
7. Custom getModel() routes to sdk.responses()
   ↓
8. Middleware applies ProviderTransform.message() (llm.ts:191)
   ├─ Message normalization
   └─ Reasoning extraction via extractReasoningMiddleware()
   ↓
9. streamText() executes with Responses API endpoint
   ↓
10. Response streamed with reasoning tokens tracked separately
```

## Transform Logic

### Reasoning Variants by Release Date (Lines 317-343)

OpenAI implements release-date-aware reasoning feature support:

**Base Support (All reasoning models):**
```typescript
WIDELY_SUPPORTED_EFFORTS = ["low", "medium", "high"]
```

**Extended Support for gpt-5-* Models:**
- Adds "minimal" effort (line 323-325)
- Rationale: Smaller models benefit from reduced reasoning budget

**Release Date >= 2025-11-13 Models (Line 326-328):**
- Adds "none" effort support
- Enables non-reasoning inference on reasoning-capable models
- Cost optimization: Use without reasoning overhead when not needed

**Release Date >= 2025-12-04 Models (Line 329-331):**
- Adds "xhigh" effort support
- Maximum reasoning token allocation
- For complex problem-solving requiring extended thinking

**Special Cases:**
- `gpt-5-pro` (line 319): Returns empty variants (no reasoning support in this model)
- Codex models (line 321): Standard efforts only, no extended support

### promptCacheKey Configuration (Lines 457-459, 484-485)

Two locations set the prompt cache key:

**Primary (Line 457-459):**
```typescript
if (model.providerID === "openai" || providerOptions?.setCacheKey) {
  result["promptCacheKey"] = sessionID
}
```
- Applied to all OpenAI models
- Uses sessionID as cache key (stable across conversation turns)
- Enables cost reduction via prompt caching: ~50% discount on cached input tokens

**Secondary - OpenCode GPT-5 Models (Line 484-485):**
```typescript
if (model.providerID.startsWith("opencode")) {
  result["promptCacheKey"] = sessionID
  result["include"] = ["reasoning.encrypted_content"]
  result["reasoningSummary"] = "auto"
}
```
- For OpenCode-hosted models using OpenAI backend
- Adds encrypted reasoning inclusion and auto-summary

### Model-Specific Options (Lines 470-488)

**GPT-5 Models (Line 470-488):**
```typescript
if (model.api.id.includes("gpt-5") && !model.api.id.includes("gpt-5-chat")) {
  // Codex exclusion
  if (model.providerID.includes("codex")) {
    result["store"] = false  // Disable result caching for code models
  }

  // Reasoning default for non-codex, non-pro models
  if (!model.api.id.includes("codex") && !model.api.id.includes("gpt-5-pro")) {
    result["reasoningEffort"] = "medium"  // Default to medium reasoning
  }

  // Text verbosity optimization
  if (model.api.id.endsWith("gpt-5.") && model.providerID !== "azure") {
    result["textVerbosity"] = "low"  // Compact output format
  }
}
```

### Provider Options Wrapper (Lines 514-518)

OpenAI options are nested under "openai" key in providerOptions:
```typescript
case "@ai-sdk/openai":
  return {
    ["openai" as string]: options,
  }
```

This maps ProviderTransform options to OpenAI SDK's expected structure:
```typescript
// Input: { reasoningEffort: "medium", promptCacheKey: "session-123" }
// Output: { openai: { reasoningEffort: "medium", promptCacheKey: "session-123" } }
```

### Small Model Options (Lines 493-498)

For parallel/fast inference paths:
```typescript
if (model.providerID === "openai" || model.api.id.includes("gpt-5")) {
  if (model.api.id.includes("5.")) {
    return { reasoningEffort: "low" }  // Latest models get low reasoning
  }
  return { reasoningEffort: "minimal" }  // Older models get minimal reasoning
}
```
- Reduces latency by limiting reasoning tokens
- Used for parallel tool execution or fast-path operations

## Key Design Decisions

1. **Custom Loader with sdk.responses() Routing**
   - Decision: Intercept model loading to use sdk.responses() instead of default chat method
   - Rationale: Responses API is OpenAI's advanced inference platform with reasoning, caching, and cost optimization
   - Trade-off: Tight coupling to Responses API; future breaking changes require loader update

2. **Release-Date-Aware Reasoning Variants**
   - Decision: Automatically enable/disable reasoning efforts based on model.release_date
   - Rationale: OpenAI's feature rollout is granular; cannot assume all models support all efforts
   - Benefit: Users get access to latest features automatically as models are updated
   - Implementation: 4 date thresholds (2025-11-13, 2025-12-04, etc.)

3. **Session-Based Prompt Cache Keys**
   - Decision: Use sessionID as promptCacheKey instead of content hash
   - Rationale: Session is the coherent unit of conversation; matches user expectations
   - Benefit: Simpler key management; stable across turns within same session
   - Trade-off: Cache hits limited to same session; cross-session reuse impossible

4. **Direct ProviderID Check Instead of SDK Package**
   - Decision: Check `model.providerID === "openai"` rather than `model.api.npm`
   - Rationale: ProviderID is semantic; npm package could vary
   - Enables: Unified handling even if multiple OpenAI-compatible implementations exist

5. **Minimal Custom Loader Options**
   - Decision: Empty options object `options: {}` passed from custom loader
   - Rationale: All configuration flows through model options and environment
   - Benefit: Separation of concerns; custom loader handles routing only
   - Constraint: Cannot pre-configure API key in custom loader

6. **Encrypted Reasoning Content Inclusion**
   - Decision: All reasoning variants include `["reasoning.encrypted_content"]`
   - Rationale: OpenAI encrypts reasoning tokens for privacy; explicit inclusion required
   - Effect: Reasoning is calculated but transmitted encrypted; user cannot inspect intermediate thinking

7. **Medium as Default Reasoning Effort**
   - Decision: gpt-5 models default to `reasoningEffort: "medium"`
   - Rationale: Balances cost and quality; most users don't need maximum reasoning
   - Override: Via variants or agent configuration
   - Excludes: Pro models, codex models, non-gpt-5 models

8. **Disable Store for Codex Models**
   - Decision: Set `store: false` for models with "codex" in providerID
   - Rationale: Codex models are specialized code completion; result caching not beneficial
   - Implementation: Only affects codex variants of gpt-5

## Notes

- **Responses API Distinction:** The `sdk.responses()` method provides access to OpenAI's Responses API (launched 2024), which is distinct from the legacy Completions API. It's the recommended path for new models and features.
- **Reasoning Token Budgets:** Unlike Anthropic's explicit budget-based thinking allocation, OpenAI's reasoning_effort is a hint (low/medium/high/xhigh); actual token usage may vary.
- **promptCacheKey Stability:** Using sessionID as cache key works because LLM.stream() is called per-user-turn within a session, guaranteeing stable session context.
- **No Autoload:** `autoload: false` ensures OpenAI provider doesn't load without credentials, preventing surprise failures.
- **Custom SDK Path:** The codebase includes `packages/opencode/src/provider/sdk/openai-compatible/src/` which provides OpenAI-compatible Responses API implementation, enabling non-OpenAI services to use same interface.
- **Cost Calculation:** Prompt caching provides ~50% discount on cached input tokens and ~25% discount on cache creation tokens; significant savings for repeated system prompts.
- **Future Versioning:** As OpenAI releases new reasoning models or changes feature support, the release_date thresholds (2025-11-13, 2025-12-04) will need periodic updates.
- **Tool Support:** Responses API supports tool calling and structured output formats; handled by OpenAIResponsesLanguageModel implementation.
- **Error Handling:** OpenAI-specific error messages handled by openai-error.ts in SDK wrapper.
- **Beta Features:** Unlike Anthropic (beta headers), OpenAI features are generally GA; no beta flag injection needed.
