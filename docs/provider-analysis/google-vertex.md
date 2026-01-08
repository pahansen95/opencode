# Google Vertex Provider Analysis

## Overview
Google Vertex AI provider for OpenCode integrates with Google Cloud's Vertex AI platform, offering access to Gemini models via two variants:
- **google-vertex**: Standard Vertex AI implementation using `@ai-sdk/google-vertex`
- **google-vertex-anthropic**: Anthropic Claude models hosted on Vertex AI using `@ai-sdk/google-vertex/anthropic` (subpath import)

Both variants auto-load when `GOOGLE_CLOUD_PROJECT` is detected, enabling seamless integration with Google Cloud environments.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 22-23 | SDK imports (`createVertex`, `createVertexAnthropic`) |
| `packages/opencode/src/provider/provider.ts` | 48-49 | Provider registration in BUNDLED_PROVIDERS map |
| `packages/opencode/src/provider/provider.ts` | 325-341 | Custom loader for google-vertex with auto-load logic |
| `packages/opencode/src/provider/provider.ts` | 342-358 | Custom loader for google-vertex-anthropic with auto-load logic |
| `packages/opencode/src/provider/provider.ts` | 941-943 | Special subpath import handling for google-vertex-anthropic |
| `packages/opencode/src/provider/transform.ts` | 376-404 | Transform variants for Vertex models (thinkingConfig) |
| `packages/opencode/src/provider/transform.ts` | 461-468 | Transform options for thinkingConfig on Vertex models |
| `packages/opencode/src/provider/transform.ts` | 527-531 | Provider options mapping for google-vertex |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/ui/src/components/provider-icons/types.ts` | 53-54 | UI provider type definitions for both Vertex variants |
| `packages/opencode/test/provider/transform.test.ts` | 1070-1097 | Transform variant tests for google-vertex models |
| `packages/ui/src/assets/icons/provider/` | - | SVG icons for google-vertex and google-vertex-anthropic |

## Design

### SDK Integration
The provider uses Vercel AI SDK's official Google Vertex bindings:
- **Main provider**: `@ai-sdk/google-vertex` (line 22) → `createVertex` (line 48)
- **Anthropic on Vertex**: `@ai-sdk/google-vertex/anthropic` (line 23) → `createVertexAnthropic` (line 49)

Both are bundled providers registered in the BUNDLED_PROVIDERS map (lines 43-65), enabling direct instantiation without dynamic npm installation.

### Custom Loader
Two custom loaders handle provider initialization:

#### google-vertex (lines 325-341)
```typescript
"google-vertex": async () => {
  const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
  const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "us-east5"
  const autoload = Boolean(project)
  if (!autoload) return { autoload: false }
  return {
    autoload: true,
    options: { project, location },
    async getModel(sdk: any, modelID: string) {
      const id = String(modelID).trim()
      return sdk.languageModel(id)
    },
  }
}
```

#### google-vertex-anthropic (lines 342-358)
Same structure but with location default of `"global"` instead of `"us-east5"`:
```typescript
"google-vertex-anthropic": async () => {
  const project = Env.get("GOOGLE_CLOUD_PROJECT") ?? Env.get("GCP_PROJECT") ?? Env.get("GCLOUD_PROJECT")
  const location = Env.get("GOOGLE_CLOUD_LOCATION") ?? Env.get("VERTEX_LOCATION") ?? "global"
  // ... same initialization pattern
}
```

**Key Features**:
- **Auto-load triggers**: Provider auto-loads when `GOOGLE_CLOUD_PROJECT` environment variable is set
- **No explicit auth required**: Relies on Google Cloud Application Default Credentials
- **Model loading**: Uses `sdk.languageModel(id)` for direct model instantiation

### Configuration
Environment variable precedence for configuration:

**Project Configuration**:
1. `GOOGLE_CLOUD_PROJECT` (primary, Google-standard)
2. `GCP_PROJECT` (alternate)
3. `GCLOUD_PROJECT` (alternate)

**Location Configuration**:
1. `GOOGLE_CLOUD_LOCATION` (primary, Google-standard)
2. `VERTEX_LOCATION` (alternate)
3. Default: `"us-east5"` for google-vertex, `"global"` for google-vertex-anthropic

When no project is set, the provider returns `{ autoload: false }`, disabling the provider until credentials are configured.

## Interfaces

### Provider Options Schema
```typescript
// Google Vertex provider options
{
  project: string          // GCP project ID (from GOOGLE_CLOUD_PROJECT)
  location: string         // Vertex AI location (from GOOGLE_CLOUD_LOCATION, defaults vary)
}

// google-vertex-anthropic uses same schema
// Both rely on Google Cloud ADC (Application Default Credentials)
```

### Model Configuration
Models use standard model IDs passed through `sdk.languageModel(id)`:
- Gemini models: `gemini-2.5-pro`, `gemini-2.0-pro`, `gemini-1.5-pro`, etc.
- Anthropic Claude models via Vertex: `claude-3-5-sonnet`, `claude-3-opus`, etc.

## Process Flows

### Initialization Flow
```
User/Config has GOOGLE_CLOUD_PROJECT set?
  ↓ YES
Provider.state() called
  ↓
Custom loader executes for "google-vertex"/"google-vertex-anthropic"
  ↓
Reads env vars: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION
  ↓
Returns { autoload: true, options: { project, location }, getModel: ... }
  ↓
mergeProvider() applies options to provider.options
  ↓
Provider registered as active
  ↓ NO
Returns { autoload: false }
  ↓
Provider not registered
```

### Request Flow
```
User requests model (e.g., "google-vertex/gemini-2.5-pro")
  ↓
Provider.getModel("google-vertex", "gemini-2.5-pro")
  ↓
Provider.getSDK(model) called
  ↓
Special case check (line 941-943):
  - If google-vertex-anthropic: use "@ai-sdk/google-vertex/anthropic"
  - Else: use standard npm path
  ↓
BUNDLED_PROVIDERS[bundledKey] instantiated with options
  - Passes { project, location } to createVertex/createVertexAnthropic
  ↓
sdk.languageModel(modelID) from custom getModel handler
  ↓
Model ready for generateText/generateMessage calls
```

## Transform Logic

### Message Normalization
No special message normalization for google-vertex (lines 376-404 only handle variants, not normalization).

### Reasoning Variants (Thinking)
Google Vertex models support extended thinking/reasoning via `thinkingConfig`:

**gemini-2.5 models** (lines 380-395):
```typescript
{
  high: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 16000
    }
  },
  max: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 24576
    }
  }
}
```

**Other gemini models** (lines 396-404):
```typescript
{
  low: { includeThoughts: true, thinkingLevel: "low" },
  high: { includeThoughts: true, thinkingLevel: "high" }
}
```

### Transform Options (lines 461-468)
Always applied for google-vertex and google-vertex-anthropic models:
```typescript
if (model.api.npm === "@ai-sdk/google" || model.api.npm === "@ai-sdk/google-vertex") {
  result["thinkingConfig"] = {
    includeThoughts: true,
  }
  if (model.api.id.includes("gemini-3")) {
    result["thinkingConfig"]["thinkingLevel"] = "high"
  }
}
```

### Provider Options Routing (lines 527-531)
Maps google-vertex models to the "google" provider options namespace:
```typescript
case "@ai-sdk/google-vertex":
case "@ai-sdk/google":
  return {
    ["google" as string]: options,
  }
```

## Key Design Decisions

1. **Two Provider Variants**: Separate `google-vertex` and `google-vertex-anthropic` providers allow independent configuration, though both share the same environment variable mechanism.

2. **Auto-load on Project Detection**: The presence of `GOOGLE_CLOUD_PROJECT` triggers auto-loading without requiring explicit API keys, leveraging Google Cloud ADC for authentication.

3. **Subpath Import Special Handling** (line 941-943): The Anthropic models require importing from `@ai-sdk/google-vertex/anthropic` rather than the standard npm path, necessitating special-case logic during SDK initialization.

4. **Location Defaults Differ**:
   - `google-vertex` defaults to `"us-east5"` (nearest US East region with Vertex AI)
   - `google-vertex-anthropic` defaults to `"global"` (Anthropic models available globally on Vertex)

5. **ThinkingConfig Format Variants**: Different Gemini versions use different thinking configurations:
   - Gemini 2.5: Uses `thinkingBudget` (token count) with `includeThoughts`
   - Gemini 2.0 and earlier: Uses `thinkingLevel` (string enum: "low"/"high")

6. **No Auth Storage Required**: Unlike most providers, google-vertex doesn't require stored API keys—it relies on Google Cloud's Application Default Credentials, reducing security complexity.

## Notes

- The custom loaders are registered in the CUSTOM_LOADERS map (line 74) and executed during Provider.state() initialization (line 811-821).
- Both variants use the same model loader pattern: simple string trimming and pass-through to `sdk.languageModel()`.
- Test coverage exists in `transform.test.ts` (lines 1070-1097) verifying variant generation for different Gemini versions.
- Provider icons are registered in UI types but icons may need to be verified in asset directory.
- The provider respects disabled_providers and enabled_providers config restrictions (lines 611-617).
