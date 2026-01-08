# Anthropic Provider Analysis

## Overview
The Anthropic provider enables integration with Claude models through OpenCode. It implements sophisticated message transformation, extended thinking (reasoning) support with budget-based token allocation, ephemeral prompt caching for cost reduction, and beta feature injection for cutting-edge capabilities. The provider supports multiple authentication methods and dynamically adjusts output token limits based on reasoning budget allocation.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 45, 75-85 | SDK bundled provider registration and custom loader with beta headers |
| `packages/opencode/src/provider/transform.ts` | 22-40, 42-57, 100-136, 141-181, 221-234, 345-360, 556-567 | Message normalization, caching, interleaved reasoning, thinking variants, output token calculation |
| `packages/opencode/src/session/system.ts` | 10, 14, 22, 31 | System prompt selection and header injection for Anthropic models |
| `packages/opencode/src/session/llm.ts` | 57, 184-198 | Streaming integration with reasoning middleware |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/console/app/src/routes/zen/util/provider/anthropic.ts` | 17-75 | Protocol translation, usage parsing, format conversion between Anthropic and OpenAI-compatible formats |
| `packages/opencode/src/config/config.ts` | 811 | Model specification documentation (example format) |
| `packages/opencode/src/provider/auth.ts` | 10-143 | Authentication method registration and OAuth/API key handling |

## Design

### SDK Integration
The Anthropic provider is registered as a bundled provider in the AI SDK factory at line 45 of provider.ts:
```typescript
"@ai-sdk/anthropic": createAnthropic
```
This allows direct SDK instantiation without dynamic package installation. The SDK is lazily initialized when a Claude model is first used, with options pre-configured via the custom loader.

### Custom Loader
Lines 75-85 of provider.ts define the custom loader that configures Anthropic-specific options:
```typescript
async anthropic() {
  return {
    autoload: false,
    options: {
      headers: {
        "anthropic-beta":
          "claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
      },
    },
  }
}
```

**Beta Headers Enabled:**
- `claude-code-20250219` - Enhanced code understanding and generation
- `interleaved-thinking-2025-05-14` - Extended thinking with interleaved reasoning output
- `fine-grained-tool-streaming-2025-05-14` - Granular tool use streaming with partial JSON support

**Configuration:**
- `autoload: false` - Manual activation required (via API key or explicit config)
- Headers are injected at SDK instantiation time, persisting across all requests for that SDK instance

### Configuration
**Environment Variables:**
- `ANTHROPIC_API_KEY` - Primary API key source (checked by provider env list)

**Config File Options:**
```
provider:
  anthropic:
    options:
      apiKey: "sk-ant-..."
      baseURL: "https://api.anthropic.com"  # Optional override
```

**Authentication Methods:**
1. Environment variable (`ANTHROPIC_API_KEY`)
2. Config file (`opencode.json`)
3. Auth plugin (if available for OAuth)
4. Direct API key via CLI auth command

## Interfaces

### Provider Options Schema
```typescript
// Anthropic-specific options passed to SDK
{
  headers: {
    "anthropic-beta": string  // Comma-separated list of beta features
    "anthropic-version": string  // API version (default: "2023-06-01")
  }
  apiKey: string  // API authentication key
  baseURL: string  // Optional custom endpoint
  timeout: number | false  // Request timeout in milliseconds
}
```

### Model Configuration
Anthropic models support variants for extended thinking:
```typescript
variants: {
  high: {
    thinking: {
      type: "enabled",
      budgetTokens: 16000  // Allocate up to 16k tokens for thinking
    }
  },
  max: {
    thinking: {
      type: "enabled",
      budgetTokens: 31999  // Allocate maximum tokens for thinking
    }
  }
}
```

Models must have `capabilities.reasoning: true` to support variants.

## Process Flows

### Initialization Flow
```
1. Provider.list() called
   ↓
2. Database built from models.dev
   ↓
3. Custom loaders executed (line 811-821)
   ↓
4. anthropic() custom loader triggered
   ↓
5. Beta headers injected into SDK options
   ↓
6. Provider marked as "custom" source with merged options
   ↓
7. Provider available if API key exists (env/config/auth)
```

### Request Flow
```
1. User message → LLM.stream() (llm.ts)
   ↓
2. System prompt selected: SystemPrompt.header(providerID) (system.ts:22)
   ↓
3. Messages + system assembled
   ↓
4. ProviderTransform.message() applied (transform.ts:221-234)
   ├─ unsupportedParts() - Filter modalities not supported by model
   ├─ normalizeMessages() - Remove empty content, sanitize Claude IDs
   └─ applyCaching() - Inject ephemeral cache control
   ↓
5. Variants merged if specified (high/max thinking variants)
   ↓
6. Provider.getLanguage() retrieves SDK instance with beta headers
   ↓
7. Middleware applies transformParams() (llm.ts:191)
   ├─ Message normalization re-applied
   └─ Reasoning extraction via extractReasoningMiddleware()
   ↓
8. streamText() executes with configured model and tools
   ↓
9. Response streamed with reasoning extracted as separate field
```

## Transform Logic

### Message Normalization (Lines 22-40)
**Purpose:** Anthropic API rejects empty messages and empty content parts
```typescript
if (model.api.npm === "@ai-sdk/anthropic") {
  // Filter out empty string messages
  // Remove empty text/reasoning parts from array content
  // Discard messages with completely empty content
}
```
**Impact:** Prevents API validation errors while preserving non-empty content

### Claude Tool ID Sanitization (Lines 42-57)
**Pattern:** `toolCallId.replace(/[^a-zA-Z0-9_-]/g, "_")`
**Reason:** Anthropic's API enforces alphanumeric, underscore, and hyphen-only tool IDs
**Applied to:** tool-call and tool-result message parts for Claude models

### Interleaved Reasoning Extraction (Lines 100-136)
**When Used:** Models with `capabilities.interleaved.field === "reasoning_content"`
**Process:**
1. Extract all reasoning parts from assistant message content
2. Join reasoning text
3. Remove reasoning parts from visible content
4. Expose reasoning under `providerOptions.openaiCompatible.reasoning_content`

**Effect:** Reasoning is calculated but not included in visible text output

### Ephemeral Prompt Caching (Lines 141-181)
**Configuration:**
```typescript
anthropic: {
  cacheControl: { type: "ephemeral" }
}
```
**Applied To:**
- First 2 system messages (if present)
- Last 2 non-system messages

**Benefits:**
- Reduces latency on repeated requests
- Reduces cost (cache read @ ~90% of normal token price)
- 5-minute TTL for ephemeral cache
- Useful for long system prompts with repeated user interactions

### Thinking Budget Allocation (Lines 556-567)
```typescript
if (enabled && budgetTokens > 0) {
  if (budgetTokens + standardLimit <= modelCap) {
    return standardLimit  // Both fit within cap
  }
  return modelCap - budgetTokens  // Reduce output to fit thinking
}
```
**Logic:** Ensures `thinking_tokens + output_tokens <= model_context_window`
**Variants:**
- `high`: 16k thinking tokens → up to ~48k output tokens
- `max`: 31.9k thinking tokens → up to ~32k output tokens
- default: 0 thinking tokens → up to 80k output tokens

## Key Design Decisions

1. **Disabled Autoload with Manual Activation**
   - Decision: `autoload: false` in custom loader
   - Rationale: Prevents accidental provider loading without valid credentials
   - Trade-off: Requires explicit API key configuration

2. **Beta Header Injection at Initialization**
   - Decision: Headers set in custom loader, not per-request
   - Rationale: Reduces overhead; beta features are stable within version lifecycle
   - Constraint: All requests to same SDK instance share beta features

3. **Ephemeral vs. Persistent Caching**
   - Decision: Use ephemeral caching (5min TTL)
   - Rationale: Balances cost savings with cache freshness for dynamic conversations
   - Alternative Rejected: Persistent caching could stale session state

4. **Discrete Thinking Variants Instead of Continuous Budget**
   - Decision: `high` (16k) and `max` (31.9k) variants only
   - Rationale: Simplifies UI; covers most use cases
   - Trade-off: Cannot set arbitrary token budgets

5. **Message Validation Before API Call**
   - Decision: Filter empty messages, normalize IDs client-side
   - Rationale: Faster failure detection; clearer error messages
   - Benefit: Prevents wasted API quota on invalid requests

6. **Separate System Prompt for Anthropic**
   - Decision: Load `anthropic_spoof.txt` header for all anthropic providers
   - Rationale: Claude models benefit from provider-optimized instructions
   - Implementation: `SystemPrompt.header(providerID)` returns spoof for anthropic

## Notes

- **Version Pinning:** `anthropic-version` defaults to "2023-06-01" (stable, older version); newer models may support newer versions
- **Cache Control Per-Part:** For non-Anthropic providers, cache control is applied per-content-part; for Anthropic, it's applied per-message
- **Reasoning Middleware Order:** `extractReasoningMiddleware()` must run after message transformation to properly extract reasoning content
- **Tool ID Collision Risk:** Sanitizing tool IDs via character replacement could theoretically cause collisions (e.g., `tool-a/b` → `tool_a_b`); mitigated by using UUIDs in practice
- **Console Layer:** The console application includes parallel format conversion between Anthropic and OpenAI-compatible APIs, enabling unified request handling
- **Model Cost Tracking:** Anthropic models track cache read/write tokens separately from standard input/output tokens for accurate billing
- **Service Tier Enforcement:** Console layer enforces `standard_only` service tier to prevent quota management issues
