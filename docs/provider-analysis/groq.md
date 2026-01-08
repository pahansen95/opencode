# Groq Provider Analysis

## Overview
Groq is a high-speed inference provider integrated into OpenCode via the AI SDK. The provider supports multiple open-source models (Llama, Mistral, Qwen) with fast inference capabilities. Groq is implemented as a simple provider without custom loaders, using the standard bundled SDK registration pattern.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| packages/opencode/src/provider/provider.ts | 30, 55 | Import statement for createGroq and BUNDLED_PROVIDERS registration |
| packages/opencode/src/provider/transform.ts | 414-425 | ThinkingLevel variants configuration (none, low, medium, high) |
| packages/opencode/test/session/fixtures/models-api.json | 2854-2960 | Provider metadata and model definitions |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| packages/opencode/package.json | 62 | Dependency declaration for @ai-sdk/groq version 2.0.33 |
| packages/ui/src/components/provider-icons/types.ts | 51 | Provider icon type registration |
| packages/ui/src/components/provider-icons/sprite.svg | 553 | SVG icon symbol definition |
| packages/web/src/content/docs/providers.mdx | 644-665 | User documentation for Groq setup instructions |
| packages/opencode/test/provider/transform.test.ts | 1116-1124 | Unit tests for Groq variants transformation |

## Design

### SDK Integration
Groq integrates through the standard bundled provider mechanism at provider.ts:55. The provider uses `createGroq` function from `@ai-sdk/groq` package (v2.0.33). No custom loader is defined for Groq in the CUSTOM_LOADERS map, meaning the provider uses default SDK initialization with standard options and model resolution via `sdk.languageModel(modelID)`.

### Custom Loader
No custom loader is implemented for Groq. The provider relies on the default provider initialization flow defined in `Provider.getSDK()` which:
1. Uses BUNDLED_PROVIDERS registry to load the createGroq function
2. Applies standard options merging (API key, headers, baseURL)
3. Calls `sdk.languageModel(modelID)` for model instantiation

### Configuration
**Environment Variables:** `GROQ_API_KEY` - Required API key for authentication (models-api.json:2856)

**Provider Options:** Standard options from the AI SDK:
- `apiKey` - API authentication key
- `baseURL` - API endpoint (default: Groq's API endpoint)
- `headers` - Optional custom headers
- `timeout` - Request timeout configuration

**Authentication Methods:** API key-based authentication via environment variable or config file

## Interfaces

### Provider Options Schema
```typescript
// Groq uses standard OpenAI-compatible options
{
  apiKey?: string;           // API key (from env or config)
  baseURL?: string;          // API base URL
  headers?: Record<string, string>;
  timeout?: number | false;
}
```

### Model Configuration
Groq models are defined in the models.json fixture with:
- `id` - Model identifier (e.g., "llama-3.1-8b-instant")
- `name` - Display name
- `family` - Model family (e.g., "llama-3.1", "mistral", "qwq")
- `tool_call` - Boolean capability flag (true for most Groq models)
- `temperature` - Boolean capability flag
- `reasoning` - Boolean flag (true for reasoning-capable models like qwq)
- `modalities` - Input/output modalities (currently text-only)
- `cost` - Pricing per input/output tokens
- `limit` - Context window and output token limits
- `status` - Model status (active, deprecated, etc.)

## Process Flows

### Initialization Flow
```
1. Provider.list() called
2. Provider.state() loads provider definitions from models.dev
3. Groq provider loaded from database with env ["GROQ_API_KEY"]
4. If GROQ_API_KEY env var exists → provider marked as available (source: "env")
5. If API key in auth store → provider marked as available (source: "api")
6. Provider registered in state.providers["groq"]
7. Models filtered based on capabilities and configuration
```

### Request Flow
```
1. User selects a Groq model (e.g., "groq/llama-3.1-8b-instant")
2. Provider.getModel("groq", "llama-3.1-8b-instant") resolves model metadata
3. Provider.getLanguage(model) called:
   a. Provider.getSDK(model) instantiates SDK
      - Retrieves provider options from state
      - Merges API key, headers, baseURL
      - Calls createGroq({ apiKey, ... })
   b. Checks for custom model loader (none exists for Groq)
   c. Calls sdk.languageModel("llama-3.1-8b-instant")
4. LanguageModelV2 instance returned for message processing
5. Messages transformed via ProviderTransform.message()
6. Request sent to Groq API endpoint
```

## Transform Logic

### Message Normalization
Groq models do not have special message normalization rules in ProviderTransform.normalizeMessages(). Messages are passed through with standard content filtering for unsupported modalities.

### Reasoning Variants
Groq supports thinking/reasoning through the `thinkingLevel` and `includeThoughts` options (transform.ts:414-425):

**Variant Configuration (thinkingLevel):**
- `none` - No thinking/reasoning (default)
- `low` - Light reasoning effort
- `medium` - Balanced reasoning effort
- `high` - Maximum reasoning effort

**Implementation:**
```typescript
// From transform.ts lines 414-425
case "@ai-sdk/groq":
  const groqEffort = ["none", ...WIDELY_SUPPORTED_EFFORTS]  // ["none", "low", "medium", "high"]
  return Object.fromEntries(
    groqEffort.map((effort) => [
      effort,
      {
        includeThoughts: true,          // Always include reasoning in output
        thinkingLevel: effort,          // Set effort level
      },
    ]),
  )
```

### Caching
Groq is not included in the applyCaching() function's provider-specific options (transform.ts:141-181), so it uses standard cache control headers if supported by the underlying API.

## Key Design Decisions

1. **No Custom Loader:** Groq uses the standard bundled provider initialization without custom hooks, making it a simple, low-maintenance integration. This works well because Groq's API aligns with the standard AI SDK patterns.

2. **ThinkingLevel Variants:** Unlike Google's `thinkingConfig` or OpenAI's `reasoningEffort`, Groq uses `thinkingLevel` and `includeThoughts` as variant options, allowing users to select reasoning intensity as a model variant rather than a runtime option.

3. **Environment Variable Discovery:** The provider automatically loads when `GROQ_API_KEY` is present in environment, enabling zero-configuration usage for users with the API key set.

4. **Model-Level Variants:** Reasoning capabilities are exposed as model variants (none/low/medium/high) rather than being built into variant logic at the model definition level.

## Notes

- Groq models in the fixture include several with "deprecated" status (mistral-saba-24b, llama3-8b-8192, llama3-70b-8192, qwen-qwq-32b), indicating model availability may change frequently
- Most Groq models support tool_call and temperature capabilities
- Only newer models (qwq, deepseek-r1) have reasoning=true
- The API endpoint for Groq is specified in the AI SDK package itself
- No special fetch customization is needed for Groq (unlike Cloudflare AI Gateway)
- Groq integrates seamlessly with the standard message transformation pipeline without provider-specific overrides
