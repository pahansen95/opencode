# GitHub Copilot Provider Analysis

## Overview

The GitHub Copilot provider integrates GitHub's Copilot models into OpenCode through an OpenAI-compatible SDK adapter. It supports both standard GitHub Copilot and enterprise variants, with models accessible via plugin-based OAuth authentication. The provider distinguishes between "codex" (completion-based) and "chat" (conversation-based) models, routing them to appropriate SDK methods.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 64, 117-140, 632-643, 838-846 | SDK registration, custom model loader, enterprise variant initialization, npm assignment |
| `packages/opencode/src/provider/transform.ts` | 513, 636-645 | Provider option namespace mapping, error message enhancement |
| `packages/opencode/src/provider/auth.ts` | 1-143 | OAuth callback handling and credential storage (inherited) |
| `packages/opencode/src/cli/cmd/auth.ts` | 274 | Auth command with github-copilot priority ranking |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/plugin/index.ts` | 14 | Built-in plugin loader reference for copilot-auth |
| `packages/opencode/src/cli/cmd/models.ts` | - | Model selection and display |
| `packages/ui/src/components/provider-icons/types.ts` | - | Provider icon display |
| `packages/opencode/src/session/prompt/copilot-gpt-5.txt` | - | Prompt template for GPT-5 variant |

## Design

### SDK Integration

**Line 64 (provider.ts)**: GitHub Copilot is registered in the `BUNDLED_PROVIDERS` object using a custom OpenAI-compatible SDK:
```typescript
"@ai-sdk/github-copilot": createGitHubCopilotOpenAICompatible,
```

This import at line 27 points to a local OpenAI-compatible implementation:
```typescript
import { createOpenaiCompatible as createGitHubCopilotOpenAICompatible } from "./sdk/openai-compatible/src"
```

The provider uses the OpenAI-compatible pattern rather than native SDK integration, allowing it to leverage GitHub's OpenAI-compatible API endpoint.

### Custom Loader

**Lines 117-140 (provider.ts)**: The `github-copilot` custom loader implements conditional model routing:

```typescript
"github-copilot": async () => {
  return {
    autoload: false,
    async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
      if (modelID.includes("codex")) {
        return sdk.responses(modelID)  // Completion-based models
      }
      return sdk.chat(modelID)          // Chat-based models
    },
    options: {},
  }
}
```

**Key Design Decision**: Models containing "codex" in their ID are routed to `sdk.responses()` (completion API), while all other models use `sdk.chat()` (conversational API). This dual-mode handling accommodates GitHub Copilot's mix of completion and chat models.

**Lines 129-140 (provider.ts)**: The `github-copilot-enterprise` variant uses identical routing logic:

```typescript
"github-copilot-enterprise": async () => {
  return {
    autoload: false,
    async getModel(sdk: any, modelID: string, _options?: Record<string, any>) {
      if (modelID.includes("codex")) {
        return sdk.responses(modelID)
      }
      return sdk.chat(modelID)
    },
    options: {},
  }
}
```

### Enterprise Variant

**Lines 632-643 (provider.ts)**: The provider automatically creates a `github-copilot-enterprise` variant from the base `github-copilot` provider definition:

```typescript
if (database["github-copilot"]) {
  const githubCopilot = database["github-copilot"]
  database["github-copilot-enterprise"] = {
    ...githubCopilot,
    id: "github-copilot-enterprise",
    name: "GitHub Copilot Enterprise",
    models: mapValues(githubCopilot.models, (model) => ({
      ...model,
      providerID: "github-copilot-enterprise",
    })),
  }
}
```

This duplicates all models from the base provider but reassigns their `providerID` to "github-copilot-enterprise", allowing separate authentication credentials while sharing the same model set.

### Authentication Flow

**Lines 769-809 (provider.ts)**: Plugin-based OAuth loader with special handling for both variants:

```typescript
for (const plugin of await Plugin.list()) {
  if (!plugin.auth) continue
  const providerID = plugin.auth.provider

  // Check auth for main provider
  let hasAuth = false
  const auth = await Auth.get(providerID)
  if (auth) hasAuth = true

  // Special handling for github-copilot: also check for enterprise auth
  if (providerID === "github-copilot" && !hasAuth) {
    const enterpriseAuth = await Auth.get("github-copilot-enterprise")
    if (enterpriseAuth) hasAuth = true
  }

  if (!hasAuth) continue
  if (!plugin.auth.loader) continue

  // Load for main provider and enterprise variant
  // ... credential merging for both variants
}
```

**Built-in Plugin**: The system includes a built-in authentication plugin at line 14:
```typescript
const BUILTIN = ["opencode-copilot-auth@0.0.9", "opencode-anthropic-auth@0.0.5"]
```

This `opencode-copilot-auth` plugin (version 0.0.9) provides the OAuth flow handler. It implements the `auth.loader` callback that accepts authentication credentials and returns merged provider options.

### Configuration

**Environment Variables**: None explicitly required; authentication is managed through OAuth via the plugin system.

**Config Options**:
- `provider.options`: Merged with OAuth-derived options from the plugin auth loader
- `provider.models`: Individual model configuration (blacklist/whitelist/variants)

**Authentication Methods**:
- **OAuth** (Primary): Provided by `opencode-copilot-auth` plugin
- **API Key** (Fallback): Can be manually set via `auth login` command

The OAuth flow is initiated through the plugin's `authorize()` method, which returns:
- `url`: Authorization URL for user
- `method`: "auto" or "code"
- `instructions`: User-facing guidance
- `callback`: Function to exchange code for tokens

Successful OAuth stores either:
- API key: `{ type: "api", key: "..." }`
- OAuth tokens: `{ type: "oauth", access: "...", refresh: "...", expires: ... }`

## Interfaces

### Provider Options Schema

The GitHub Copilot provider accepts OpenAI-compatible options passed through the custom loader options and plugin auth loader merge:

```typescript
interface CopilotProviderOptions {
  // From OpenAI-compatible SDK
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  timeout?: number | false
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

  // Merged from plugin auth loader
  [key: string]: any  // Custom options from oauth flow
}
```

### Model Configuration

Models are defined in the models.dev database and stored with:
- `id`: Unique model identifier (e.g., "gpt-4-turbo")
- `name`: Display name
- `providerID`: "github-copilot" or "github-copilot-enterprise"
- `api.id`: API model name (passed to SDK)
- `api.npm`: Always "@ai-sdk/github-copilot" for both variants (lines 838-846)
- `capabilities`: Temperature support, tool calls, modalities
- `cost`: Input/output pricing
- `limit`: Context window and max output tokens

**Special Model Properties**:
- Models with "codex" in ID are completion-style (routed to `sdk.responses()`)
- All other models are chat-style (routed to `sdk.chat()`)

## Process Flows

### Initialization Flow

```
1. Provider.state() initialization (line 605)
   ↓
2. Load models from models.dev database
   ↓
3. Create github-copilot-enterprise variant (lines 632-643)
   ↓
4. Merge environment variables (lines 742-751)
   ↓
5. Load OAuth credentials from Auth storage (lines 753-762)
   ↓
6. Load plugins (lines 764-809)
   ├── Find plugin where auth.provider === "github-copilot"
   ├── Check for auth in both variants
   └── Call plugin.auth.loader() to merge OAuth options
   ↓
7. Apply custom loader (lines 811-821)
   ├── Execute getModel method for model lookup
   └── Set autoload = false (requires explicit auth)
   ↓
8. Verify provider allowed by config (lines 832-846)
   ├── Reassign npm to "@ai-sdk/github-copilot" for both variants
   └── Apply blacklist/whitelist filtering
   ↓
9. Store in providers map
```

### Request Flow

```
1. User selects model (e.g., "gpt-4-turbo")
   ↓
2. getLanguage() called (line 1001)
   ↓
3. getSDK() for model (line 892)
   ├── Retrieve provider options
   ├── Check bundled provider (line 944)
   ├── Found: "@ai-sdk/github-copilot" → use createGitHubCopilotOpenAICompatible()
   ├── Pass baseURL, apiKey, headers, fetch to SDK
   └── Cache SDK instance by hash
   ↓
4. Custom getModel() executed (line 1010-1011)
   ├── Check if modelID includes "codex"
   ├── Yes: return sdk.responses(modelID)
   └── No: return sdk.chat(modelID)
   ↓
5. Return LanguageModelV2 instance
   ↓
6. Process request through model
   ├── Transform messages via ProviderTransform.message()
   ├── Apply provider options (line 511-545)
   ├── Send to GitHub Copilot API endpoint
   └── Return response
```

## Transform Logic

### Provider Options Namespace

**Line 513 (transform.ts)**: GitHub Copilot models use OpenAI-compatible option namespacing:

```typescript
case "@ai-sdk/github-copilot":
case "@ai-sdk/openai":
case "@ai-sdk/azure":
  return {
    ["openai" as string]: options,
  }
```

Options passed to the model are wrapped in an "openai" namespace, matching OpenAI API convention.

### Error Message Enhancement

**Lines 636-645 (transform.ts)**: GitHub Copilot-specific error handling:

```typescript
if (providerID === "github-copilot" && message.includes("The requested model is not supported")) {
  return (
    message +
    "\n\nMake sure the model is enabled in your copilot settings: https://github.com/settings/copilot/features"
  )
}
```

When a model is not supported, users are directed to GitHub Copilot settings page for enabling additional models.

### Message Transformation

GitHub Copilot models use standard OpenAI-compatible message format. No special normalization is applied (like Anthropic's empty content filtering or Mistral's tool call ID normalization).

### Caching

No caching-specific logic applies to GitHub Copilot (caching is provider-agnostic).

### Reasoning Variants

No reasoning variant support defined for GitHub Copilot models (variants function returns empty object for @ai-sdk/github-copilot).

## Key Design Decisions

### 1. Dual Model Router Architecture

**Decision**: Route models based on "codex" presence in model ID.
**Rationale**: GitHub Copilot offers both completion-based (codex) and chat-based models on the same API. The router enables seamless switching without separate provider instances.

### 2. OpenAI-Compatible Adapter

**Decision**: Use custom OpenAI-compatible SDK instead of native Copilot SDK.
**Rationale**: GitHub Copilot API is OpenAI-compatible, reducing maintenance burden and allowing reuse of OpenAI SDK patterns.

### 3. Enterprise Variant as Provider Duplicate

**Decision**: Auto-create github-copilot-enterprise as complete provider copy with separate auth.
**Rationale**: Enterprise and standard Copilot may require separate OAuth flows but share identical models. Duplication allows independent credential management.

### 4. Plugin-Based Authentication

**Decision**: Delegate OAuth to plugin system (opencode-copilot-auth).
**Rationale**: Keeps OpenCode core decoupled from GitHub-specific OAuth flows; plugins can evolve independently.

### 5. No Autoload

**Decision**: Set autoload = false for both variants.
**Rationale**: GitHub Copilot requires authentication; autoload would fail for users without valid credentials. Users must explicitly authenticate first.

### 6. Universal Model Support

**Decision**: All non-codex models → chat endpoint; codex models → responses endpoint.
**Rationale**: Accommodates GitHub's dual-mode API without per-model configuration, treating API mode as model property rather than provider configuration.

## Notes

- **Model Availability**: Models are fetched from models.dev database. The system calls `ModelsDev.refresh()` hourly to stay current (models.ts line 107).
- **Small Model Selection**: GitHub Copilot models receive special priority in small model selection (provider.ts lines 1065-1068), prioritizing free models like "gpt-5-mini".
- **Auth Command**: GitHub Copilot ranks as priority 2 in auth login prompt (auth.ts line 274), after opencode.
- **Plugin Handling**: Both auth checking (lines 775-778) and option loading (lines 793-807) have special logic to register models under both standard and enterprise provider IDs when the plugin provides support.
- **SDK Compatibility**: The custom OpenAI-compatible SDK (`./sdk/openai-compatible/src`) is local to the codebase and handles GitHub Copilot API specifics (URL routing, token handling, response format conversion).
- **No Direct API Key**: While API keys can be stored, the recommended flow is OAuth through the plugin, which handles token refresh and expiration.
