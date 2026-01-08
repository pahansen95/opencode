# Azure Cognitive Services Provider Analysis

## Overview

Azure Cognitive Services is a specialized provider for accessing OpenAI models through Microsoft Azure's infrastructure. Unlike the standard Azure provider, this implementation auto-constructs the baseURL from an Azure resource name environment variable, enabling direct integration with Azure OpenAI deployments. Models are hosted on Azure infrastructure with Azure-specific deployment requirements.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `/packages/opencode/src/provider/provider.ts` | 46, 154-169 | SDK registration and custom loader implementation |
| `/packages/opencode/src/provider/transform.ts` | 300-316 | Azure-specific reasoning variant configuration |
| `/packages/opencode/test/session/fixtures/models-api.json` | 28862+ | Test fixture defining azure-cognitive-services provider metadata |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `/packages/ui/src/components/provider-icons/types.ts` | 70 | Provider icon definition for UI |
| `/packages/web/src/content/docs/providers.mdx` | 294-339 | User documentation and setup instructions |

## Design

### SDK Integration

The azure-cognitive-services provider uses the bundled `@ai-sdk/azure` SDK (registered at provider.ts line 46 in the BUNDLED_PROVIDERS map). This SDK is the same as the standard Azure provider but is specifically configured for Azure Cognitive Services deployments with resource-specific endpoint construction.

**Key Code (provider.ts lines 43-65):**
```typescript
const BUNDLED_PROVIDERS: Record<string, (options: any) => SDK> = {
  "@ai-sdk/amazon-bedrock": createAmazonBedrock,
  "@ai-sdk/anthropic": createAnthropic,
  "@ai-sdk/azure": createAzure,  // Line 46: Used by both azure and azure-cognitive-services
  ...
}
```

### Custom Loader

The azure-cognitive-services provider implements a custom loader (provider.ts lines 154-169) that:

1. **Retrieves Resource Name**: Reads the `AZURE_COGNITIVE_SERVICES_RESOURCE_NAME` environment variable (line 155)
2. **Constructs BaseURL**: Auto-generates the OpenAI endpoint from the resource name using the pattern: `https://${resourceName}.cognitiveservices.azure.com/openai` (line 166)
3. **Model Access Method**: Delegates model access to either `sdk.chat()` or `sdk.responses()` based on the `useCompletionUrls` option (lines 159-163)

**Custom Loader Implementation (provider.ts lines 154-169):**
```typescript
"azure-cognitive-services": async () => {
  const resourceName = Env.get("AZURE_COGNITIVE_SERVICES_RESOURCE_NAME")
  return {
    autoload: false,
    async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
      if (options?.["useCompletionUrls"]) {
        return sdk.chat(modelID)
      } else {
        return sdk.responses(modelID)
      }
    },
    options: {
      baseURL: resourceName ? `https://${resourceName}.cognitiveservices.azure.com/openai` : undefined,
    },
  }
}
```

**Comparison with Standard Azure Provider (provider.ts lines 141-153):**

The standard azure provider (lines 141-153) uses a similar custom loader but does NOT auto-construct the baseURL. Instead, it relies on explicit configuration:

```typescript
"azure": async () => {
  return {
    autoload: false,
    async getModel(sdk: any, modelID: string, options?: Record<string, any>) {
      if (options?.["useCompletionUrls"]) {
        return sdk.chat(modelID)
      } else {
        return sdk.responses(modelID)
      }
    },
    options: {},  // No auto-constructed baseURL
  }
}
```

### Configuration

**Environment Variables (models-api.json line 28862):**
- `AZURE_COGNITIVE_SERVICES_RESOURCE_NAME`: The Azure resource name that becomes part of the endpoint URL (e.g., "my-resource")
- `AZURE_COGNITIVE_SERVICES_API_KEY`: The API key for authentication (either KEY 1 or KEY 2 from Azure portal)

**BaseURL Construction Logic:**
- If `AZURE_COGNITIVE_SERVICES_RESOURCE_NAME` is set: `https://{resourceName}.cognitiveservices.azure.com/openai`
- If `AZURE_COGNITIVE_SERVICES_RESOURCE_NAME` is not set: `undefined` (undefined baseURL will likely cause initialization to fail)

**Authentication:**
The provider integrates with the existing auth system via the standard API key mechanism. Users can:
1. Run `/connect` command to store the API key
2. Set `AZURE_COGNITIVE_SERVICES_API_KEY` environment variable
3. Configure via opencode.json config file

**Autoload Behavior:**
- `autoload: false` - Explicitly requires user to configure before loading

## Interfaces

### Provider Options Schema

```typescript
interface AzureCognitiveServicesOptions {
  baseURL?: string;  // Auto-constructed from AZURE_COGNITIVE_SERVICES_RESOURCE_NAME
  apiKey?: string;   // Provided via AZURE_COGNITIVE_SERVICES_API_KEY
  headers?: Record<string, string>;
}

interface ModelLoadOptions {
  useCompletionUrls?: boolean;  // Determines sdk.chat() vs sdk.responses()
  reasoningEffort?: "low" | "medium" | "high" | "minimal";
  reasoningSummary?: "auto";
  include?: string[];
}
```

### Model Configuration

Models are defined in the models database with standard capabilities:
- **Example**: gpt-5-pro with 400k context, 272k output
- **Reasoning Support**: Full reasoning variant support for GPT-5 models
- **Structured Output**: Support for structured outputs on compatible models
- **Cost Tracking**: Per-token pricing for input/output with optional cache pricing

**Key Constraint (providers.mdx line 303):**
> The deployment name must match the model name for opencode to work properly.

This means if a model is deployed as "gpt-5-pro" in Azure, it must be referenced as "gpt-5-pro" in requests.

## Process Flows

### Initialization Flow

```
1. Provider.list() called
   ↓
2. Provider.state() loads from Provider.Info
   ↓
3. CUSTOM_LOADERS["azure-cognitive-services"] invoked (line 811-821)
   ↓
4. Reads AZURE_COGNITIVE_SERVICES_RESOURCE_NAME env var (line 155)
   ↓
5. Constructs baseURL: https://{resourceName}.cognitiveservices.azure.com/openai
   ↓
6. Returns loader config with:
   - autoload: false
   - getModel function (routes to chat or responses)
   - options: { baseURL: "..." }
   ↓
7. mergeProvider() combines with auth credentials from:
   - Environment variables (AZURE_COGNITIVE_SERVICES_API_KEY)
   - Auth storage (/connect command)
   - Config file (opencode.json)
```

### Request Flow

```
1. User selects model (e.g., gpt-5-pro)
   ↓
2. Provider.getLanguage() invoked with Model
   ↓
3. Provider.getSDK() creates SDK instance with:
   - baseURL: https://{resourceName}.cognitiveservices.azure.com/openai
   - apiKey: AZURE_COGNITIVE_SERVICES_API_KEY
   - Custom timeout and fetch handling (lines 919-939)
   ↓
4. Bundled @ai-sdk/azure provider instantiated with options
   ↓
5. Model loader (getModel) called with modelID and options
   ↓
6. Returns either sdk.chat(modelID) or sdk.responses(modelID)
   ↓
7. Request sent to Azure endpoint with model deployment
   ↓
8. Response processed through standard message transform pipeline
```

## Transform Logic

### Reasoning Variants (transform.ts lines 300-316)

Azure Cognitive Services supports reasoning models with special configuration for GPT-5 models:

```typescript
case "@ai-sdk/azure":
  // https://v5.ai-sdk.dev/providers/ai-sdk-providers/azure
  if (id === "o1-mini") return {}
  const azureEfforts = ["low", "medium", "high"]
  if (id.includes("gpt-5-") || id === "gpt-5") {
    azureEfforts.unshift("minimal")  // Add "minimal" effort for GPT-5
  }
  return Object.fromEntries(
    azureEfforts.map((effort) => [
      effort,
      {
        reasoningEffort: effort,
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    ]),
  )
```

**Variant Details:**
- **Low**: Minimal reasoning steps
- **Medium**: Balanced reasoning
- **High**: Extended reasoning
- **Minimal**: Only for GPT-5 models (minimal/fast reasoning)
- **reasoningSummary: "auto"**: Automatically generates summaries
- **include: ["reasoning.encrypted_content"]**: Includes encrypted reasoning details in response

### Message Normalization

The provider uses the standard `@ai-sdk/azure` message handling via `normalizeMessages()` - no Azure-specific message transformation logic exists in transform.ts.

### Caching

Caching is applied via `applyCaching()` (transform.ts lines 141-181) which adds provider-specific cache control to system and final messages. For Azure/OpenAI compatible providers:

```typescript
openaiCompatible: {
  cache_control: { type: "ephemeral" },
}
```

## Key Design Decisions

1. **Separate Provider from Standard Azure**: Rather than embedding the resource-name logic into the azure provider, azure-cognitive-services is a distinct provider entry with specialized configuration.

2. **Auto-Constructed Endpoint**: The baseURL is automatically constructed from a single environment variable (`AZURE_COGNITIVE_SERVICES_RESOURCE_NAME`), reducing friction for users who don't need to memorize full endpoint URLs.

3. **SDK Reuse**: Both azure and azure-cognitive-services use the same `@ai-sdk/azure` SDK - the difference is purely in configuration and initialization.

4. **Explicit Autoload=false**: Prevents accidental provider initialization without proper credentials.

5. **Environment Variable Naming Convention**: Follows a clear convention (`AZURE_COGNITIVE_SERVICES_*`) that mirrors the provider ID, making it discoverable.

6. **Deployment Name Matching**: Enforces that Azure deployment names match model IDs, simplifying the mental model for users managing Azure resources.

## Notes

- **No Plugin Integration**: Unlike some providers (e.g., github-copilot), azure-cognitive-services does not have plugin-based auth loading (lines 764-809).

- **Missing from Config**: While the provider appears in the models database and test fixtures, it may need explicit addition to opencode.json if users want to override model lists or enable/disable it.

- **Azure Cognitive Services vs Azure OpenAI**: The provider name refers to "Azure Cognitive Services" but actually targets Azure OpenAI specifically (a service within Azure AI Services/Cognitive Services).

- **Resource Naming**: The environment variable `AZURE_COGNITIVE_SERVICES_RESOURCE_NAME` expects just the resource name (e.g., "my-resource"), not the full endpoint URL.

- **Regional Deployment**: Azure resources have regional deployments. The resource name encodes the region implicitly, and the endpoint construction does not expose region selection.

- **Model Deployment Requirement**: Unlike some providers where model IDs are predefined, Azure requires active deployments in the resource for each model, making model availability dynamic based on user's Azure configuration.
