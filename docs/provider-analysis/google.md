# Google Provider Analysis

## Overview
The Google provider integration in OpenCode implements support for Google's Generative AI models (Gemini) and Vertex AI through the `@ai-sdk/google` and `@ai-sdk/google-vertex` packages. The provider handles model registration, parameter transformation, schema sanitization for Gemini compatibility, and reasoning/thinking configuration. There is no custom loader for the Google provider—it uses the bundled SDK registration directly.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 21-22, 47-49 | SDK imports and BUNDLED_PROVIDERS registration for @ai-sdk/google and @ai-sdk/google-vertex |
| `packages/opencode/src/provider/transform.ts` | 240, 257, 267 | Temperature (1.0), topP (0.95), and topK (64) defaults for Gemini models |
| `packages/opencode/src/provider/transform.ts` | 376-404 | Variants configuration for reasoning/thinking support (thinkingConfig/thinkingLevel/thinkingBudget) |
| `packages/opencode/src/provider/transform.ts` | 461-468 | Options function: thinkingConfig and thinkingLevel setup for Google models |
| `packages/opencode/src/provider/transform.ts` | 499-501 | SmallOptions function: thinkingBudget = 0 for fast inference |
| `packages/opencode/src/provider/transform.ts` | 527-531 | ProviderOptions wrapper mapping Google options to "google" namespace |
| `packages/opencode/src/provider/transform.ts` | 592-631 | Schema sanitization: converts integer enums to string enums for Gemini compatibility |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/console/app/src/routes/zen/util/provider/google.ts` | 29-74 | Google helper for streaming responses: modifyUrl, modifyHeaders, usage parsing |
| `packages/opencode/test/session/fixtures/models-api.json` | (provider section) | Test fixtures defining Google provider configuration and Gemini models |

## Design

### SDK Integration
The Google provider is registered in the BUNDLED_PROVIDERS map (lines 47-49 of provider.ts) with two entries:
- `"@ai-sdk/google"`: Uses `createGoogleGenerativeAI` from "@ai-sdk/google" package
- `"@ai-sdk/google-vertex"`: Uses `createVertex` from "@ai-sdk/google-vertex" package

Both are directly bundled without a custom loader function. When a Google model is requested, the SDK initialization (lines 913-952 of provider.ts) checks if the model's api.npm matches "@ai-sdk/google" or "@ai-sdk/google-vertex" and uses the BUNDLED_PROVIDERS mapping to instantiate the provider.

### Custom Loader
**No custom loader is defined for Google.** Unlike providers such as Anthropic, Azure, or Amazon Bedrock that have custom loaders in the CUSTOM_LOADERS map (lines 75-441 of provider.ts), Google uses the standard bundled provider mechanism. This means:
- No environment variable auto-detection for API keys
- No special option preprocessing
- Models are loaded using the standard `sdk.languageModel(model.api.id)` pattern

### Configuration

**Environment Variables:**
From test fixtures (models-api.json), the Google provider accepts:
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `GEMINI_API_KEY`

**Provider NPM Packages:**
- `"@ai-sdk/google"` - Google Generative AI API (Gemini)
- `"@ai-sdk/google-vertex"` - Google Cloud Vertex AI

**API Endpoint:**
Google Generative AI API endpoint is determined by the ai-sdk package (default: https://generativelanguage.googleapis.com/v1beta)

**Model Access:**
Models are accessed via model.api.id (e.g., "gemini-3-pro", "gemini-2.5-flash") through the Gemini API.

## Interfaces

### Provider Options Schema
The Google provider accepts standard reasoning configuration options:

```typescript
// For @ai-sdk/google and @ai-sdk/google-vertex models:
{
  thinkingConfig?: {
    includeThoughts?: boolean;  // Include thoughts/reasoning in response
    thinkingLevel?: "low" | "high";  // For Gemini 2.5+, thinkingLevel for older models
    thinkingBudget?: number;  // Token budget for thinking (Gemini 2.5+, e.g., 16000-24576)
  };

  // Wrapped in provider namespace:
  {
    google: {
      thinkingConfig: { ... }
    }
  }
}
```

### Model Configuration
Models from the Google provider inherit the following defaults:

**Temperature Defaults (line 240):**
- Gemini models: `1.0` (identified by "gemini" in model.id)

**TopP Defaults (line 257):**
- Gemini models: `0.95` (identified by "gemini" in model.id)

**TopK Defaults (line 267):**
- Gemini models: `64` (identified by "gemini" in model.id)

**Capabilities:**
All Gemini models support:
- `temperature`: true (configurable)
- `tool_call`: true (function calling)
- `attachment`: true (multimodal input)
- `reasoning`: true (for 2.5-pro and 3-pro models, enables thinking)

## Process Flows

### Initialization Flow
```
1. Provider Registration (provider.ts:47)
   ├─ "@ai-sdk/google" maps to createGoogleGenerativeAI
   └─ Models loaded from models.dev database

2. Model Instantiation (provider.ts:1001-1026)
   ├─ getLanguage(model) called
   ├─ getSDK(model) retrieves SDK
   ├─ Check for custom loader (none exists for google)
   └─ Call sdk.languageModel(model.api.id) directly

3. Options Setup (transform.ts:461-468)
   ├─ thinkingConfig added with includeThoughts: true
   ├─ For gemini-3 models: add thinkingLevel: "high"
   └─ Wrapped in { google: {...} } namespace
```

### Request Flow
```
1. Message Normalization (transform.ts:19-139)
   └─ Standard message processing, no Gemini-specific handling

2. Schema Transformation (transform.ts:572-634)
   └─ If model.providerID === "google" or model.api.id includes "gemini":
      ├─ Run sanitizeGemini() on JSON schema
      ├─ Convert integer enums to string enums
      └─ Change type from "integer"/"number" to "string" for enum fields

3. Parameter Application (transform.ts:461-468)
   ├─ Set thinkingConfig.includeThoughts = true
   ├─ For gemini-3: set thinkingConfig.thinkingLevel = "high"
   └─ For other reasoning models: use variants configuration

4. Streaming Response Parsing (packages/console/app/src/routes/zen/util/provider/google.ts:29-74)
   ├─ Stream separator: "\r\n\r\n"
   ├─ Parse usageMetadata from each chunk
   ├─ Extract: promptTokenCount, candidatesTokenCount, cachedContentTokenCount, thoughtsTokenCount
   └─ Normalize to standard OpenCode token usage format
```

## Transform Logic

### Temperature/TopP/TopK Defaults
- **temperature()** (line 236-249): Returns `1.0` for Gemini models (line 240)
- **topP()** (line 251-259): Returns `0.95` for Gemini models (line 257)
- **topK()** (line 261-269): Returns `64` for Gemini models (line 267)

### Reasoning Variants (lines 376-404)
For Gemini models with reasoning capability:

**Gemini 2.5 Models (identified by "2.5" in model.id):**
```typescript
{
  high: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 16000,  // Mid-range thinking budget
    },
  },
  max: {
    thinkingConfig: {
      includeThoughts: true,
      thinkingBudget: 24576,  // Maximum thinking budget for Gemini 2.5
    },
  },
}
```

**Gemini 3 and Other Reasoning Models (default):**
```typescript
{
  low: {
    includeThoughts: true,
    thinkingLevel: "low",
  },
  high: {
    includeThoughts: true,
    thinkingLevel: "high",
  },
}
```

**Note:** Gemini 2.5 uses `thinkingConfig.thinkingBudget` (token budget), while other models use `thinkingLevel` with "low"/"high" effort levels.

### Options Function (lines 461-468)
For `@ai-sdk/google` and `@ai-sdk/google-vertex` models:
```typescript
result["thinkingConfig"] = {
  includeThoughts: true,  // Always enable thoughts in reasoning responses
}
if (model.api.id.includes("gemini-3")) {
  result["thinkingConfig"]["thinkingLevel"] = "high"  // Default to high effort for Gemini 3
}
```

### SmallOptions Function (lines 499-501)
For fast/lightweight inference with Google provider:
```typescript
if (model.providerID === "google") {
  return { thinkingConfig: { thinkingBudget: 0 } }  // Disable thinking for speed
}
```

### Schema Sanitization for Gemini (lines 591-631)
Gemini models have strict schema requirements—integer enum values must be strings.

The `sanitizeGemini()` function (lines 593-628):
1. Recursively traverses JSON schema
2. For fields with `enum` arrays: converts all values to strings (line 606)
3. If field has type "integer" or "number" with an enum: changes type to "string" (lines 608-610)
4. Filters required array to only include fields that exist in properties (lines 619-621)
5. Ensures array items schema is not null (lines 623-625)

**Example Transformation:**
```typescript
// Input schema
{
  type: "object",
  properties: {
    status: {
      type: "integer",
      enum: [0, 1, 2]
    }
  }
}

// After sanitizeGemini
{
  type: "object",
  properties: {
    status: {
      type: "string",  // Changed from "integer"
      enum: ["0", "1", "2"]  // Values converted to strings
    }
  }
}
```

### ProviderOptions Wrapper (lines 527-531)
Google options are wrapped in a "google" namespace for the underlying AI SDK:
```typescript
case "@ai-sdk/google-vertex":
case "@ai-sdk/google":
  return {
    ["google" as string]: options,
  }
```

This ensures options like `thinkingConfig` are properly scoped when passed to the underlying Vercel AI SDK.

## Key Design Decisions

1. **No Custom Loader:** Google provider relies entirely on bundled SDK registration without custom pre-processing. This simplifies the integration but means API key handling is standard (from environment or config).

2. **Unified Thinking Configuration:** Both `thinkingLevel` and `thinkingBudget` configurations are supported through the variants system, allowing flexibility for different Gemini model generations. Gemini 2.5 uses token budgets while Gemini 3 uses effort levels.

3. **Schema Sanitization for Type Compatibility:** The sanitizeGemini function ensures JSON schemas work with Gemini's strict requirements by converting all enum values to strings and adjusting types accordingly.

4. **Default Temperature = 1.0:** Gemini models default to temperature 1.0 (maximum diversity) compared to other providers. This is baked into the temperature() function.

5. **TopK Parameter:** Google implements topK sampling (64 tokens) as a standard parameter distinct from topP, following Gemini's API specification.

6. **Thinking as Optional Variant:** Rather than forcing thinking/reasoning on all requests, it's implemented as variants with "low", "high", or "max" options, allowing per-request control.

## Notes

- **Streaming Usage Parsing:** The Google helper in packages/console/app/src/routes/zen/util/provider/google.ts demonstrates custom streaming response parsing for Google's usageMetadata format, including thoughtsTokenCount for reasoning token tracking.

- **Gemini 2.5 vs Gemini 3 Models:** The variants function (lines 380-404) distinguishes Gemini 2.5 models by checking for "2.5" in the model ID and uses different thinking configuration structure (thinkingBudget instead of thinkingLevel).

- **No Message Normalization:** Unlike some providers (Anthropic, Mistral), Google models don't require special message normalization—they accept standard AI SDK message formats.

- **API Key Requirements:** The provider requires one of `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` environment variables (or configuration-based API keys) to be set for authentication.
