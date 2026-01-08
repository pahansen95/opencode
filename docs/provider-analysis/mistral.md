# Mistral Provider Analysis

## Overview
Mistral is integrated as a bundled AI SDK provider using the `@ai-sdk/mistral` package. The provider is registered directly in the SDK registry without requiring a custom loader. Mistral models support tool calling and basic capabilities, with specific message normalization requirements for tool call ID formatting and message sequence validation.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 29, 54 | SDK import and registration in BUNDLED_PROVIDERS |
| `packages/opencode/src/provider/transform.ts` | 58-98, 278, 406-408 | Message normalization, variant handling, and reasoning configuration |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 54 | Mistral SDK registration in BUNDLED_PROVIDERS (no custom loader) |
| `packages/opencode/src/provider/transform.ts` | 58-98 | normalizeMessages function with Mistral-specific logic |
| `packages/opencode/src/provider/transform.ts` | 278 | Reasoning variants exclusion for Mistral models |
| `packages/opencode/src/provider/transform.ts` | 406-408 | Reasoning variants function return (empty object) |

## Design

### SDK Integration
Mistral is integrated as a bundled provider through direct import of the `createMistral` function from `@ai-sdk/mistral` package (line 29 of provider.ts). The provider is registered in the `BUNDLED_PROVIDERS` record at line 54 with the key `"@ai-sdk/mistral"`, mapping directly to the `createMistral` function. This allows the OpenCode system to instantiate Mistral provider instances without requiring additional dynamic imports or custom initialization logic.

### Custom Loader
Mistral does **not** have a custom loader defined in the `CUSTOM_LOADERS` object (lines 74-441 of provider.ts). The provider relies entirely on the standard bundled provider initialization flow. This means Mistral models are loaded using the standard `sdk.languageModel(modelID)` method call without additional processing.

### Configuration
**Environment Variable**: `MISTRAL_API_KEY`
- Defined in models-api.json fixture as the required environment variable
- Configurable through OpenCode config files and environment variables

**Provider Options**: Standard provider options apply:
- `apiKey`: API key for Mistral (can be set via environment variable or provider configuration)
- `baseURL`: Optional base URL override for Mistral API
- `timeout`: Optional timeout configuration
- `headers`: Optional custom headers

**Authentication Methods**: API key-based authentication via `MISTRAL_API_KEY` environment variable or OpenCode auth system.

## Interfaces

### Provider Options Schema
```typescript
// Standard provider options (from provider.ts lines 899-911)
interface MistralProviderOptions {
  apiKey?: string                    // Loaded from MISTRAL_API_KEY env var or auth config
  baseURL?: string                   // Defaults to model.api.url if not specified
  headers?: Record<string, string>   // Optional custom headers from model.headers
  timeout?: number | false           // Optional timeout configuration
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}
```

### Model Configuration
Mistral models are configured through the models.dev data source with the following structure:
```typescript
{
  id: string              // Model identifier (e.g., "pixtral-12b-2409")
  name: string            // Display name
  family: string          // "mistral" or model-specific family
  attachment: boolean     // false (Mistral doesn't support attachments)
  reasoning: boolean      // false (no reasoning capability)
  tool_call: boolean      // true (supports tool calling)
  temperature: boolean    // true (supports temperature parameter)
  release_date: string    // ISO date format
  modalities: {
    input: ["text"]       // Text input only
    output: ["text"]      // Text output only
  }
  cost: {
    input: number         // Cost per input token
    output: number        // Cost per output token
  }
  limit: {
    context: number       // Context window size
    output: number        // Maximum output tokens
  }
  status: "active" | "deprecated"
  options: {}             // No provider-specific options
}
```

## Process Flows

### Initialization Flow
```
1. Provider.state() initialization (provider.ts line 605)
2. Load Mistral from models database (fromModelsDevProvider)
3. Check if MISTRAL_API_KEY env var exists (line 745)
   ├─ If found: mergeProvider with source: "env"
   └─ If not found: skip provider loading
4. Check for API key in Auth storage (line 754)
   ├─ If found: mergeProvider with source: "api"
   └─ If not found: continue
5. CUSTOM_LOADERS check (line 811)
   └─ Skipped for Mistral (no custom loader)
6. Provider.getSDK() called for first request (line 892)
   ├─ Resolve bundled provider key: "@ai-sdk/mistral"
   ├─ Call BUNDLED_PROVIDERS["@ai-sdk/mistral"](options)
   ├─ Options include apiKey, baseURL, headers, timeout
   └─ Cache SDK instance by options hash (line 913)
```

### Request Flow
```
1. User initiates request with Mistral model
2. Provider.getLanguage(model) called (line 1001)
3. Provider.getSDK(model) invoked (line 1007)
4. Bundled createMistral() instantiated with normalized options
5. ProviderTransform.message(messages, model) processes messages (line 1012)
   ├─ normalizeMessages() applies Mistral-specific normalization (line 58-98)
   │  ├─ Tool call ID normalization to 9 chars alphanumeric (lines 67-71)
   │  ├─ Message sequence fix: insert assistant message between tool→user (lines 84-95)
   │  └─ Returns normalized message array
   └─ Returns processed messages
6. sdk.languageModel(modelID) called with normalized messages
7. Mistral API receives request
8. Response streamed/returned to caller
```

## Transform Logic

### Message Normalization (lines 58-98 of transform.ts)
The Mistral provider implements critical message transformations:

**Tool Call ID Normalization**:
- **Requirement**: Tool call IDs must be exactly 9 alphanumeric characters
- **Process**:
  1. Remove all non-alphanumeric characters from original toolCallId
  2. Take first 9 characters via `substring(0, 9)`
  3. Pad with zeros to reach exactly 9 characters if less via `padEnd(9, "0")`
- **Applied to**: Both `tool-call` and `tool-result` message parts
- **Lines**: 65-79

**Message Sequence Validation**:
- **Issue**: Tool messages cannot be directly followed by user messages in Mistral API
- **Fix**: When a `tool` message is followed by a `user` message, insert an intermediate `assistant` message
- **Injected Message Content**:
  ```typescript
  {
    role: "assistant",
    content: [{ type: "text", text: "Done." }]
  }
  ```
- **Applied at**: Lines 85-95
- **Significance**: Ensures valid message flow for tool-use sequences

### Caching & Reasoning
- **Caching**: Mistral models do NOT receive cache control hints (not in applyCaching providerOptions)
- **Reasoning Variants**: Return empty object (line 408)
  - Mistral does not support extended reasoning capabilities
  - No reasoning effort levels or configuration options
- **Variant Check**: Mistral explicitly excluded from reasoning capability check (line 278)

## Key Design Decisions

1. **No Custom Loader**
   - Decision: Use standard bundled provider initialization
   - Rationale: Mistral SDK requires no special setup or model method routing (unlike OpenAI's custom .chat() method or Azure's conditional routing)
   - Result: Simpler integration, relies entirely on `sdk.languageModel(modelID)`

2. **Strict Tool Call ID Format**
   - Decision: Implement 9-character alphanumeric requirement with padding
   - Rationale: Mistral API enforces this constraint; normalization prevents runtime errors from SDK-generated IDs
   - Result: Transparent to users; IDs are automatically normalized before API calls

3. **Message Sequence Normalization**
   - Decision: Insert assistant messages to fix invalid tool→user transitions
   - Rationale: Mistral API strictly validates message sequence; user messages cannot immediately follow tool messages
   - Result: Automatic repair of message sequences from multi-turn interactions

4. **Reasoning Variants Disabled**
   - Decision: Return empty object for reasoning variants; exclude from variant eligibility
   - Rationale: Mistral does not provide reasoning/extended-thinking capabilities
   - Result: No reasoning variants offered to users; prevents incorrect configuration

## Notes

- Mistral integration is straightforward with no custom loaders, reflecting the provider's standard API design
- The primary complexity lies in message normalization requirements (tool IDs and sequence validation)
- Mistral models appear to be widely used in the codebase, with proper integration for text-based tool-calling tasks
- No special caching strategies are applied for Mistral (unlike Anthropic or OpenRouter)
- The provider is fully compatible with the OpenCode provider abstraction layer
- Tool call functionality is fully supported, making Mistral suitable for agent-based applications
- Context windows vary by model (typically 32K-128K based on models-api.json)
- All Mistral models report cost information (input and output token pricing)
