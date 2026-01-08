# Cerebras Provider Analysis

## Overview
Cerebras is a high-performance inference provider specializing in efficient model execution, integrated into OpenCode via the AI SDK. The provider supports various open-source and proprietary models (Llama, GLM, GPT-OSS) with cost-free inference capabilities. Cerebras implements a simple custom loader that injects a 3rd-party integration header for tracking purposes and disables automatic loading.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| packages/opencode/src/provider/provider.ts | 32, 57 | Import statement for createCerebras and BUNDLED_PROVIDERS registration |
| packages/opencode/src/provider/provider.ts | 431-440 | Custom loader implementation with X-Cerebras-3rd-Party-Integration header |
| packages/opencode/src/provider/transform.ts | 289-290 | ReasoningEffort variants configuration (low, medium, high) |
| packages/opencode/test/session/fixtures/models-api.json | 33384-33400+ | Provider metadata and model definitions |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| packages/opencode/package.json | 56 | Dependency declaration for @ai-sdk/cerebras version 1.0.33 |
| packages/ui/src/components/provider-icons/types.ts | Reference | Provider icon type registration |
| packages/ui/src/components/provider-icons/sprite.svg | Reference | SVG icon symbol definition |
| packages/opencode/test/provider/transform.test.ts | 765-781 | Unit tests for Cerebras variants transformation |

## Design

### SDK Integration
Cerebras integrates through the standard bundled provider mechanism at provider.ts:57. The provider uses `createCerebras` function from `@ai-sdk/cerebras` package (v1.0.33). Unlike some providers, Cerebras has a custom loader defined in the CUSTOM_LOADERS map that intercepts initialization to inject tracking headers and control autoload behavior.

### Custom Loader
Cerebras implements a simple custom loader (provider.ts:431-440) that performs the following:
1. Sets `autoload: false` - requiring explicit user configuration to enable (provider does not auto-enable based on API key presence)
2. Injects custom headers for API requests via the `options` field:
   - `X-Cerebras-3rd-Party-Integration: "opencode"` - Cerebras-specific header identifying OpenCode as the 3rd-party integration client
3. Returns standard options structure for provider initialization

This design ensures all requests to Cerebras API include attribution while giving users control over when the provider is activated.

### Configuration
**Environment Variables:** `CEREBRAS_API_KEY` - API key for authentication (models-api.json:33385)

**Provider Options:** Cerebras uses standard AI SDK options with custom injected headers:
- `apiKey` - API authentication key
- `baseURL` - API endpoint (default: Cerebras' API endpoint)
- `headers` - Custom headers including `X-Cerebras-3rd-Party-Integration`
- `timeout` - Request timeout configuration

**Authentication Methods:** API key-based authentication via environment variable or config file. Manual setup required due to `autoload: false`.

**Custom Header:** The `X-Cerebras-3rd-Party-Integration: "opencode"` header is automatically injected by the custom loader and indicates that requests are being made through the OpenCode integration.

## Interfaces

### Provider Options Schema
```typescript
// Cerebras uses standard AI SDK options with custom headers injected by the loader
{
  apiKey?: string;           // API key (from env or config)
  baseURL?: string;          // API base URL
  headers?: {
    'X-Cerebras-3rd-Party-Integration': 'opencode';  // Injected by custom loader
    [key: string]: string;
  };
  timeout?: number | false;
}
```

### Model Configuration
Cerebras models are defined in the models.json fixture with properties including:
- `id` - Model identifier (e.g., "cerebras-llama-4-scout-17b-16e-instruct", "zai-glm-4.7")
- `name` - Display name
- `attachment` - Boolean capability flag (false for Cerebras models)
- `reasoning` - Boolean flag for reasoning capability (false for current models)
- `tool_call` - Boolean capability flag (true for supported models)
- `temperature` - Boolean capability flag (true for all Cerebras models)
- `modalities` - Input/output modalities (text-only for current offerings)
- `cost` - Pricing per input/output tokens (0 for all Cerebras models, indicating free inference)
- `limit` - Context window and output token limits

## Process Flows

### Initialization Flow
```
1. Provider.list() called
2. Provider.state() loads provider definitions from models.dev
3. Cerebras provider loaded from database with env ["CEREBRAS_API_KEY"]
4. Custom loader cerebras() is invoked (provider.ts:431-440)
5. Custom loader sets autoload: false → provider NOT automatically marked available
6. Custom loader injects headers { "X-Cerebras-3rd-Party-Integration": "opencode" }
7. User must manually set up API key via `/connect` command or config
8. Once API key provided, provider marked as available (source: "api")
9. Provider registered in state.providers["cerebras"]
10. Models filtered based on capabilities and configuration
```

### Request Flow
```
1. User selects a Cerebras model (e.g., "cerebras/zai-glm-4.7")
2. Provider.getModel("cerebras", "zai-glm-4.7") resolves model metadata
3. Provider.getLanguage(model) called:
   a. Provider.getSDK(model) instantiates SDK
      - Retrieves provider options from state
      - Merges API key, headers (including X-Cerebras-3rd-Party-Integration), baseURL
      - Calls createCerebras({ apiKey, headers, ... })
   b. Checks for custom model loader (none defined for Cerebras)
   c. Calls sdk.languageModel("zai-glm-4.7")
4. LanguageModelV2 instance returned for message processing
5. Messages transformed via ProviderTransform.message()
6. Request sent to Cerebras API endpoint with X-Cerebras-3rd-Party-Integration header
```

## Transform Logic

### Message Normalization
Cerebras models do not have special message normalization rules in ProviderTransform.normalizeMessages(). Messages are passed through with standard content filtering for unsupported modalities (Cerebras supports text-only input/output).

### Reasoning Variants
Cerebras supports reasoning through the `reasoningEffort` option (transform.ts:289-290):

**Variant Configuration (reasoningEffort):**
- `low` - Light reasoning effort
- `medium` - Balanced reasoning effort
- `high` - Maximum reasoning effort

**Implementation:**
```typescript
// From transform.ts lines 289-290
case "@ai-sdk/cerebras":
  return Object.fromEntries(WIDELY_SUPPORTED_EFFORTS.map((effort) => [effort, { reasoningEffort: effort }]))
  // WIDELY_SUPPORTED_EFFORTS = ["low", "medium", "high"]
```

**Key distinction:** Unlike providers that support "none" effort level (OpenAI, Gateway), Cerebras only supports three intermediate levels, with no explicit "none" option. This reflects Cerebras' reasoning capabilities architecture.

### Caching
Cerebras is not included in the applyCaching() function's provider-specific options (transform.ts:141-181), so standard cache control is applied through the generic openaiCompatible provider options if supported.

## Key Design Decisions

1. **Custom Loader with autoload: false:** Unlike most providers that auto-enable when an API key is detected, Cerebras requires explicit user setup. This design gives users deliberate control over provider activation while the custom loader handles infrastructure concerns (header injection).

2. **X-Cerebras-3rd-Party-Integration Header:** The injected header serves as attribution and integration tracking for Cerebras' business intelligence. This is automatically applied without requiring user configuration, ensuring compliance with Cerebras' integration tracking requirements.

3. **ReasoningEffort Variants with Three Levels:** Cerebras supports low/medium/high reasoning effort but not "none". The variant configuration reflects this provider-specific capability constraint, allowing users to select reasoning intensity without a non-reasoning option.

4. **Free Inference Model:** All Cerebras models have zero cost for input/output tokens (models-api.json), reflecting the provider's strategy. This makes Cerebras an economical alternative despite potential performance/latency trade-offs.

5. **Standard Model Loader:** No custom model loader is implemented for Cerebras. Standard SDK initialization via `sdk.languageModel(modelID)` is sufficient, indicating good compatibility with the AI SDK's default patterns.

## Notes

- Cerebras currently offers models from multiple architectures: Llama (Scout, Maverick variants), GLM (Z.AI GLM-4.7), and GPT-OSS series
- All current Cerebras models are text-only (no image, audio, video, PDF support)
- No models currently support reasoning (reasoning: false for all), though the variant system is in place for future reasoning-capable models
- Most Cerebras models support tool_call and temperature capabilities
- The API documentation is available at https://inference-docs.cerebras.ai/models/overview
- Cerebras API endpoint is specified in the @ai-sdk/cerebras package itself
- The custom loader pattern for Cerebras is simpler than Cloudflare AI Gateway (which has custom fetch override) but serves a similar purpose of provider-specific configuration
- Provider requires manual setup via `/connect` command due to autoload: false setting
