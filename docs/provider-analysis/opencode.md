# OpenCode Provider Analysis

## Overview
The OpenCode provider is the first-party hosted provider service integrated into OpenCode. It serves as the primary provider for the OpenCode project itself, offering access to models like "big-pickle" and other proprietary/exclusive models. The provider implements a unique "freemium" model where public API access is available for models with zero input cost, while authenticated users with API keys can access all available models.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `/packages/opencode/src/provider/provider.ts` | 86-107 | Custom loader implementation with free model filtering |
| `/packages/opencode/src/provider/transform.ts` | 452, 483-487 | Transform logic for OpenCode-specific models and GPT-5 reasoning options |
| `/packages/opencode/src/provider/auth.ts` | (entire file) | Authentication method definitions via plugin system |
| `/packages/opencode/src/session/llm.ts` | 164-171 | Header injection for OpenCode requests |
| `/packages/opencode/src/acp/agent.ts` | 1020-1045 | Fallback provider selection logic |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `/packages/opencode/src/provider/provider.ts` | 1062-1064 | Small model priority override for OpenCode provider |
| `/packages/opencode/src/provider/provider.ts` | 1076-1080 | Fallback check for OpenCode provider availability |
| `/packages/opencode/src/session/llm.ts` | 164-171 | Custom headers injection for authenticated OpenCode requests |
| `/packages/opencode/src/tool/registry.ts` | 125 | Flag-based feature access tied to OpenCode provider |
| `/packages/opencode/src/acp/agent.ts` | 1045 | Default fallback to "opencode/big-pickle" when no other providers available |

## Design

### SDK Integration
The OpenCode provider is loaded through the custom loader mechanism defined in the `CUSTOM_LOADERS` object. Unlike bundled providers that use direct imports, the OpenCode provider uses dynamic SDK instantiation via the `@ai-sdk/openai-compatible` SDK (the default for OpenCode-compatible endpoints). The provider endpoint and model definitions are loaded from the `models.dev` API, which returns up-to-date model information in real-time.

### Custom Loader
**File**: `/packages/opencode/src/provider/provider.ts`, Lines 86-107

The OpenCode custom loader implements sophisticated conditional logic:

1. **Authentication Detection** (lines 87-94):
   - Checks environment variables via `Env.all()`
   - Queries stored authentication via `Auth.get(input.id)`
   - Checks configuration file at `config.provider?.["opencode"]?.options?.apiKey`

2. **Free Model Filtering** (lines 96-101):
   - When no API key is present, iterates through all models in `input.models`
   - Deletes any model where `value.cost.input !== 0` (non-free models)
   - Keeps only models with zero input cost for public access

3. **Autoload Decision** (lines 103-106):
   - Sets `autoload: true` only if models remain after filtering or if authenticated
   - Returns `apiKey: "public"` when unauthenticated to enable free tier access
   - Returns empty options object for authenticated users (they provide their own key via stored auth)

### Configuration
**Environment Variables**: None required for basic access; authenticated access via stored API keys via the Auth system

**Configuration File Support**:
- Optional `config.provider?.["opencode"]?.options?.apiKey` for static API key configuration

**Authentication Methods**:
- Supported via plugin-based Auth system defined in `/packages/opencode/src/provider/auth.ts`
- No OAuth configuration visible; primarily API key based
- Default public API key fallback: `"public"` (line 105)

## Interfaces

### Provider Options Schema
```typescript
// OpenCode provider uses OpenAI-compatible interface
interface OpenCodeOptions {
  apiKey?: string;           // Optional; "public" used for free tier, stored auth for paid
  baseURL?: string;          // Set to model.api.url at runtime
  includeUsage?: boolean;    // Auto-set to true for OpenAI-compatible SDK
  headers?: Record<string, string>;  // Custom headers injected at request time
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  timeout?: number | false;  // Global timeout option
}

// Request headers injected for authenticated OpenCode requests:
interface OpenCodeRequestHeaders {
  "x-opencode-project": string;    // Instance.project.id
  "x-opencode-session": string;    // sessionID from request context
  "x-opencode-request": string;    // user.id
  "x-opencode-client": string;     // Flag.OPENCODE_CLIENT
}
```

### Model Configuration
Models are sourced from `models.dev` API and include:
- Standard model metadata: id, name, family, capabilities (reasoning, temperature, toolcall, etc.)
- Cost structure: input/output per token, cache read/write costs, and context-over-200k pricing tiers
- Capabilities flags for modalities (text, audio, image, video, pdf) for both input and output
- Release dates used to determine available reasoning effort variants
- Special model: "big-pickle" is prioritized as the default high-quality model for OpenCode contexts

## Process Flows

### Initialization Flow
```
1. CUSTOM_LOADERS["opencode"] invoked during Provider.state() initialization
   └─> Check for API key (env, stored auth, or config file)

2. If API key found:
   └─> autoload: true, return empty options (auth handled separately)

3. If NO API key found:
   └─> Filter input.models: delete all models with cost.input > 0
   └─> If models remain after filtering:
       └─> autoload: true, return options: { apiKey: "public" }
   └─> If no free models available:
       └─> autoload: false (provider not loaded)

4. Provider merged into state with custom options
5. Models filtered from database based on free tier availability
6. Provider registered in state.providers["opencode"] if autoloaded
```

### Request Flow
```
1. User calls model with providerID="opencode"

2. getSDK() constructs options:
   - base: provider.options (from custom loader)
   - override: model.api.url as baseURL
   - fallback: provider.key as apiKey (if not in options)
   - merge: model.headers into options.headers

3. Custom fetch middleware applied:
   - Combines abort signals for timeout handling
   - Preserves custom fetch if present

4. SDK instantiation via @ai-sdk/openai-compatible:
   - Uses npm package defined in model.api.npm
   - Calls model.api.id as the model identifier

5. If session request (providerID.startsWith("opencode")):
   - Additional headers injected via llm.ts lines 164-171:
     * "x-opencode-project": project ID
     * "x-opencode-session": session ID
     * "x-opencode-request": user ID
     * "x-opencode-client": client type
```

## Transform Logic

### Special Model Handling (transform.ts lines 452, 483-487)

**Line 452**: Models "kimi-k2-thinking" and "glm-4.6" from OpenCode provider get special chat template arguments:
```typescript
if (model.providerID === "opencode" &&
    ["kimi-k2-thinking", "glm-4.6"].includes(model.api.id)) {
  result["chat_template_args"] = { enable_thinking: true }
}
```

**Lines 483-487**: GPT-5 models on OpenCode provider get enhanced reasoning configuration:
```typescript
if (model.providerID.startsWith("opencode")) {
  result["promptCacheKey"] = sessionID          // Enable prompt caching per session
  result["include"] = ["reasoning.encrypted_content"]  // Include reasoning output
  result["reasoningSummary"] = "auto"           // Auto-summarize reasoning
}
```

### Small Model Selection (provider.ts lines 1062-1064)
When selecting a small model for OpenCode provider context, "gpt-5-nano" is prioritized over the standard priority list, indicating specialized model selection for the platform's primary provider.

### Caching Strategy
The OpenCode provider receives prompt cache key support for GPT-5 models, enabling per-session caching to optimize token usage for reasoning-heavy workloads.

## Key Design Decisions

1. **Freemium Model with Cost-Based Filtering**: The provider uses model cost data to automatically expose free models to unauthenticated users while keeping paid models hidden unless authenticated. This is more sophisticated than simple enable/disable switches.

2. **Public API Key as Fallback**: Using the literal string "public" as the API key for free tier access allows the OpenCode platform to identify and track free-tier requests without requiring users to register credentials.

3. **Dynamic Model Source**: Models sourced from `models.dev` API rather than static configuration enables real-time updates to model availability without code deployment.

4. **Request Context Headers**: Injecting project/session/user/client headers only for OpenCode provider requests enables server-side analytics, abuse prevention, and feature flagging per deployment context.

5. **Platform Provider as Default Fallback**: The acp/agent.ts implementation defaults to "opencode/big-pickle" when no other providers are available, making OpenCode the ultimate fallback provider for the platform.

6. **Reasoning Support for GPT-5**: GPT-5 models specifically get reasoning configuration (promptCacheKey, reasoning summary, encrypted content inclusion) that other models don't, indicating platform-level optimization for advanced reasoning workloads.

## Notes

- The provider uses `model.api.npm` to determine the SDK package, defaulting to `@ai-sdk/openai-compatible`
- The "big-pickle" model appears to be an exclusive OpenCode platform model with special handling in model selection
- The provider is tightly integrated with OpenCode's core identity: project/session/request IDs are embedded in request headers
- Authentication is decoupled from provider initialization; the provider can operate with "public" API key while Auth system manages stored credentials separately
- The provider supports all standard model capabilities including reasoning, tool calls, and multimodal inputs based on model.dev data
- Provider state is cached in `state.providers["opencode"]` and reused across requests for performance
