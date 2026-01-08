# Azure Provider Analysis

## Overview

Azure is a cloud-based LLM provider that serves OpenAI-compatible models through Microsoft Azure AI Services. It uses the `@ai-sdk/azure` SDK and shares authentication patterns with OpenAI (API key and resource name). Azure models support reasoning capabilities with configurable effort levels and encrypted reasoning content.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 46 | SDK registration in BUNDLED_PROVIDERS map |
| `packages/opencode/src/provider/provider.ts` | 141-153 | Azure custom loader implementation |
| `packages/opencode/src/provider/transform.ts` | 300-316 | Reasoning variants generation for Azure models |
| `packages/opencode/src/provider/transform.ts` | 479-480 | Azure-specific exclusion in textVerbosity logic |
| `packages/opencode/src/provider/transform.ts` | 515 | OpenAI-style options wrapper for Azure |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/session/llm.ts` | 158 | Provider options transformation in stream flow |
| `packages/opencode/src/provider/auth.ts` | 10-143 | Authentication method registration (handled via Config.provider) |
| Test fixtures | `packages/opencode/test/session/fixtures/models-api.json` | Model definitions and environment variables |
| Test cases | `packages/opencode/test/provider/transform.test.ts` lines 855-902 | Reasoning variants validation |

## Design

### SDK Integration

Azure is registered as a bundled provider in the BUNDLED_PROVIDERS map (line 46) using the `createAzure` function from `@ai-sdk/azure`. This allows direct instantiation without dynamic imports.

```typescript
// Line 46: SDK Registration
"@ai-sdk/azure": createAzure,
```

The provider is instantiated through the standard getSDK flow, receiving options including:
- `apiKey`: Azure API key (set from environment or auth)
- `baseURL`: Derived from model.api.url (default: model endpoint configuration)
- Additional headers and timeout configurations

### Custom Loader

The Azure custom loader (lines 141-153) implements conditional model instantiation based on the `useCompletionUrls` option:

```typescript
// Lines 141-153: Custom Loader Implementation
azure: async () => {
  return {
    autoload: false,
    async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
      if (options?.["useCompletionUrls"]) {
        return sdk.chat(modelID)      // Chat completions endpoint
      } else {
        return sdk.responses(modelID)  // Completion responses endpoint
      }
    },
    options: {},
  }
},
```

**Key Design Decision**: The `useCompletionUrls` option determines which model instantiation method is used:
- `sdk.chat(modelID)`: Returns a chat-based language model using completion URLs
- `sdk.responses(modelID)`: Returns a chat-based language model using standard responses (default)

This provides flexibility for organizations needing specific endpoint configurations.

### Configuration

**Environment Variables**:
- `AZURE_RESOURCE_NAME`: Azure resource name for API endpoint (e.g., "mycompany")
- `AZURE_API_KEY`: API key for authentication (required)

**Required Options**:
- `apiKey`: Provided from Azure environment or auth configuration
- `baseURL`: Azure endpoint URL (auto-configured from model configuration)

**Optional Options**:
- `useCompletionUrls`: Boolean flag to switch between chat and responses endpoints (defaults to false)
- Custom headers for request authentication

## Interfaces

### Provider Options Schema

```typescript
// Azure SDK initialization options
{
  name: string,              // Provider name: "azure"
  apiKey: string,            // Azure API key
  baseURL?: string,          // Azure endpoint URL
  useCompletionUrls?: boolean,  // Switch between endpoint types
  fetch?: Function,          // Custom fetch implementation
  timeout?: number,          // Request timeout
  headers?: Record<string, string>  // Custom headers
}
```

### Model Configuration

Azure models are standard OpenAI-compatible models deployed on Azure. The fixture (models-api.json) shows:

```typescript
{
  "id": "gpt-4.1-nano",      // Model identifier
  "name": "GPT-4.1 nano",    // Display name
  "reasoning": true,         // Supports reasoning
  "temperature": true,       // Supports temperature parameter
  "tool_call": true,         // Supports tool calling
  "modalities": {
    "input": ["text", "image"],
    "output": ["text"]
  },
  "limit": {
    "context": 1047576,
    "output": 32768
  }
}
```

## Process Flows

### Initialization Flow

```
1. User configures Azure provider with AZURE_API_KEY and AZURE_RESOURCE_NAME
2. Provider.getModel() is called
3. Custom loader checks if provider exists in modelLoaders
4. getSDK() is invoked:
   - SDK instantiation via createAzure()
   - baseURL set from model.api.url
   - apiKey injected from environment/auth
5. Model is retrieved via custom loader's getModel():
   - Checks options?.useCompletionUrls flag
   - Returns sdk.chat() or sdk.responses() accordingly
6. LLM service wraps model with middleware
```

### Request Flow

```
1. User sends message through LLM.stream()
2. ProviderTransform.message() normalizes messages (no Azure-specific transforms)
3. ProviderTransform.providerOptions() wraps options as { openai: {...} }
   - Azure options wrapped under "openai" key (line 515-518)
4. streamText() is called with:
   - Wrapped language model
   - Provider-specific reasoning variants
   - Message normalization via middleware
5. Request sent to Azure endpoint with:
   - Reasoning parameters (if variant selected)
   - Encrypted reasoning content flag
6. Response streamed back with tool calls, text, and reasoning
```

## Transform Logic

### Message Transformations

Azure uses **no custom message transformations**. It leverages the OpenAI-compatible interface without model-specific adjustments.

### Reasoning Variants

Azure supports three reasoning effort levels, with conditional addition of "minimal" effort for GPT-5 models (lines 300-316):

```typescript
// Base efforts for all reasoning-capable models
["low", "medium", "high"]

// For GPT-5 models: add "minimal" effort
if (id.includes("gpt-5-") || id === "gpt-5") {
  azureEfforts.unshift("minimal")
}

// Generate variant options
{
  low:     { reasoningEffort: "low",     reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
  medium:  { reasoningEffort: "medium",  reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
  high:    { reasoningEffort: "high",    reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
  // GPT-5 only:
  minimal: { reasoningEffort: "minimal", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] }
}
```

**Exception**: `o1-mini` model returns empty variants (no reasoning support).

### OpenAI-Style Options Wrapper

Lines 515-518 wrap Azure options under the "openai" namespace, treating Azure as an OpenAI-compatible provider:

```typescript
// Azure uses OpenAI-style options wrapping
case "@ai-sdk/azure":
  return {
    ["openai" as string]: options,  // Wrap under "openai" key
  }
```

This allows Azure models to use OpenAI-compatible reasoning parameters (reasoningEffort, reasoningSummary, include).

### GPT-5 Specific Logic

Line 479-480 explicitly excludes Azure from textVerbosity settings for GPT-5 models:

```typescript
if (model.api.id.endsWith("gpt-5.") && model.providerID !== "azure") {
  result["textVerbosity"] = "low"
}
```

This indicates Azure handles text verbosity differently or doesn't support the parameter, requiring explicit exclusion.

## Key Design Decisions

### 1. Dual Endpoint Support (`useCompletionUrls`)
The custom loader provides flexibility between Azure's chat and completion endpoints. This accommodates organizations with different Azure configurations without requiring code changes.

### 2. OpenAI-Compatible Wrapper
Azure reasoning variants and options are wrapped under the "openai" namespace (line 515), acknowledging that Azure models are OpenAI-compatible. This reduces code duplication and ensures consistency with OpenAI's reasoning API.

### 3. Reasoning Encryption
All Azure reasoning variants include `include: ["reasoning.encrypted_content"]`, indicating Azure encrypts reasoning content for security and requires explicit inclusion in the response.

### 4. GPT-5 Effort Graduation
GPT-5 models receive a "minimal" effort option in addition to the standard three levels, providing more granular control for the most capable models.

### 5. Model-Specific Exclusions
The `o1-mini` model returns empty variants, and GPT-5 models are excluded from textVerbosity settings, suggesting these models have specific constraints on reasoning configuration at the provider level.

## Notes

- Azure provider autoload is `false`, requiring explicit configuration in opencode.json or environment variables
- Both "azure" and "azure-cognitive-services" providers use `@ai-sdk/azure` SDK but may differ in resource configuration
- The reasoning variants system is test-covered (transform.test.ts lines 855-902), validating effort level generation
- Azure-specific logic is minimal—most functionality leverages OpenAI compatibility
- The provider requires explicit AZURE_RESOURCE_NAME and AZURE_API_KEY environment variables or config
