# OpenRouter Provider Analysis

## Overview
OpenRouter is a unified API gateway that provides access to multiple language models from various providers through a single endpoint. It is integrated into OpenCode using the `@openrouter/ai-sdk-provider` SDK, which allows seamless interaction with OpenRouter's model catalog. The provider supports API key authentication via the `OPENROUTER_API_KEY` environment variable and implements custom request headers for identification and tracking.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 26, 52 | SDK import and registration in bundled providers |
| `packages/opencode/src/provider/provider.ts` | 303-313 | Custom loader configuration with HTTP headers |
| `packages/opencode/src/provider/transform.ts` | 281-283 | Variant configuration for reasoning-capable models |
| `packages/opencode/src/provider/transform.ts` | 441-448 | Provider options with usage inclusion for OpenRouter models |
| `packages/opencode/src/provider/transform.ts` | 502-507 | Small options configuration for reasoning reduction |
| `packages/opencode/src/provider/transform.ts` | 149-151 | Ephemeral caching configuration |
| `packages/opencode/src/provider/transform.ts` | 536-539 | Provider options wrapping for OpenRouter namespace |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/test/provider/provider.test.ts` | 1775-1806 | Configuration test with model inheritance |
| `packages/opencode/test/provider/transform.test.ts` | 687-745 | Variant transformation tests for reasoning models |
| `packages/opencode/test/session/fixtures/models-api.json` | 21326-21399+ | Model definitions with provider-specific npm overrides |
| `packages/opencode/src/cli/cmd/auth.ts` | 277 | Auth retry count configuration |

## Design

### SDK Integration
OpenRouter integrates via the `@openrouter/ai-sdk-provider` package (line 26 in provider.ts). The provider is registered in the `BUNDLED_PROVIDERS` map at line 52, allowing it to be loaded as a built-in provider without dynamic npm installation. The SDK is instantiated using `createOpenRouter()` function with custom options.

### Custom Loader
The custom loader for OpenRouter (lines 303-313 in provider.ts) implements the following:
- **autoload**: Set to `false`, requiring explicit API key configuration
- **HTTP-Referer header**: `https://opencode.ai/` (line 308) - Identifies requests from OpenCode to OpenRouter for analytics/tracking
- **X-Title header**: `opencode` (line 309) - Application identifier for OpenRouter's logging and metrics

### Configuration
**Environment Variable**: `OPENROUTER_API_KEY` - The API key for authenticating requests to OpenRouter's API endpoint

**API Endpoint**: `https://openrouter.ai/api/v1` (from models fixture, line 21330) - OpenRouter's standard v1 API endpoint

**Auth Method**: API key-based authentication - The key is provided via environment variable and automatically passed to the SDK

## Interfaces

### Provider Options Schema
```typescript
{
  headers: {
    "HTTP-Referer": "https://opencode.ai/",
    "X-Title": "opencode"
  }
}
```

### Model Configuration
OpenRouter models are defined in the models fixture with:
- **id**: Model identifier (e.g., `moonshotai/kimi-k2-thinking`)
- **provider field**: Optional npm override to `@openrouter/ai-sdk-provider` for specific models (line 21398 in fixture)
- **api.npm**: Defaults to `@ai-sdk/openai-compatible` for standard models, can be overridden per-model
- **reasoning capability**: Supported via variant configurations for qualifying models

## Process Flows

### Initialization Flow
```
1. Provider discovery: OpenRouter provider loaded from database/models fixture
2. Custom loader invoked (lines 303-313)
3. Headers applied to all requests: HTTP-Referer and X-Title
4. Model list populated from models-api.json fixture
5. Variants generated for reasoning-capable models (lines 281-283)
6. Provider marked as ready when OPENROUTER_API_KEY environment variable is set
```

### Request Flow
```
1. Model request initiated by user
2. SDK instantiation via createOpenRouter() with custom headers
3. If model has reasoning capability:
   - Variants available: "none", "minimal", "low", "medium", "high", "xhigh"
   - Usage tracking enabled (line 442-444)
   - For Gemini models: default reasoning effort set to "high" (line 445-447)
4. Small model requests: reasoning minimized via smallOptions() (line 502-507)
5. Ephemeral cache control applied to system and final messages (lines 149-151)
6. Provider options wrapped in "openrouter" namespace (lines 536-539)
7. Request sent to https://openrouter.ai/api/v1 with headers and auth key
```

## Transform Logic

### Reasoning Variants (Lines 281-283)
For OpenRouter provider with `@openrouter/ai-sdk-provider` npm package:
- **Model Filter**: Only GPT models, Gemini-3 models, and Grok-4 models return variants
- **Variant Levels**: `none`, `minimal`, `low`, `medium`, `high`, `xhigh` (OPENAI_EFFORTS array)
- **Configuration**: Each variant maps to `{ reasoning: { effort: "<level>" } }`

### Provider Options (Lines 441-448)
For models using `@openrouter/ai-sdk-provider`:
- **Usage Inclusion**: `{ include: true }` - Enables usage tracking in responses
- **Gemini-3 Special Case**: Sets `{ reasoning: { effort: "high" } }` for Gemini-3 models by default

### Small Options (Lines 502-507)
When using reduced reasoning for small models:
- **Google Models**: Returns `{ reasoning: { enabled: false } }` - Disables reasoning entirely
- **Other Models**: Returns `{ reasoningEffort: "minimal" }` - Uses minimal reasoning effort

### Caching (Lines 149-151)
Ephemeral cache control is applied to OpenRouter requests:
- **Cache Type**: `{ type: "ephemeral" }`
- **Applied To**: System messages and final non-system messages only
- **Purpose**: Enables prompt caching for cost reduction while preventing stale cached responses

## Key Design Decisions

1. **No Autoload**: OpenRouter requires explicit API key configuration, preventing accidental usage without credentials
2. **Custom Headers**: HTTP-Referer and X-Title headers allow OpenRouter to identify and track OpenCode traffic separately
3. **Model-Level SDK Overrides**: Specific models (like `moonshotai/kimi-k2-thinking`) can override the default npm provider to use `@openrouter/ai-sdk-provider` directly instead of OpenAI-compatible SDK
4. **Reasoning Variant Support**: OpenRouter's support for multiple reasoning models (GPT, Gemini-3, Grok-4) is exposed through standardized variant configurations
5. **Usage Tracking**: Explicit inclusion of usage data in responses enables cost tracking and analytics
6. **Ephemeral Caching**: Prompt caching is enabled but restricted to ephemeral type to balance cost savings with response freshness

## Notes

- OpenRouter is positioned as a unified gateway provider, offering access to models from multiple vendors through a single API endpoint and authentication method
- The provider supports both generic OpenAI-compatible models and specialized models via the native `@openrouter/ai-sdk-provider` SDK
- Model variants are auto-generated for reasoning-capable models, providing users with control over reasoning effort levels
- The HTTP headers serve dual purposes: user identification (`X-Title`) and referrer information (`HTTP-Referer`) for OpenRouter's internal tracking
- Ephemeral caching with prompt caching helps reduce API costs for repeated conversations
- The test fixture at lines 1775-1806 demonstrates that new models defined in config inherit the provider's API endpoint automatically, supporting flexible model additions without code changes
