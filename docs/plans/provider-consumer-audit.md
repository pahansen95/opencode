# Provider Consumer Audit

This document catalogs all usages of the provider system across the OpenCode codebase. Generated as part of Phase 0 of the Provider Protocol Rewrite Plan.

## Summary

| Namespace | Call Sites | Files |
|-----------|------------|-------|
| Provider. | 58 | 16 |
| ProviderTransform. | 12 | 4 |
| ProviderAuth. | 5 | 1 |
| ModelsDev. | 15 | 8 |

---

## Provider Namespace Usages

### session/system.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 26 | Provider.Model (type) | Type annotation for provider function parameter |

### session/index.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 395 | Provider.Model (type) | Type annotation in session schema (z.custom) |

### session/compaction.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 30 | Provider.Model (type) | Type annotation for isOverflow input |
| 102 | Provider.getModel | Get model for compaction from agent config |
| 103 | Provider.getModel | Get model for compaction from user message |

### session/processor.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 28 | Provider.Model (type) | Type annotation for processor input model |

### share/share-next.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 39 | Provider.getModel | Get model info for share event |
| 172 | Provider.getModel | Get model info for share message mapping |

### session/summary.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 79 | Provider.getSmallModel | Get small model for summary generation |
| 80 | Provider.getModel | Fallback to full model if no small model |
| 89 | Provider.getModel | Get model from agent config for summary |
| 133 | Provider.getModel | Get model for summary agent |

### session/llm.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 31 | Provider.Model (type) | Type annotation for LLM input model |
| 55 | Provider.getLanguage | Get language model for streaming |
| 84 | Provider.getProvider | Get provider info for options |
| 102 | Provider.getProvider | Get provider for small model options |

### session/prompt.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 312 | Provider.getModel | Get model from last user message |
| 640 | Provider.defaultModel | Get default model when none specified |
| 645 | Provider.Model (type) | Type annotation for prompt input |
| 1010 | Provider.getModel | Get model for tool schema transformation |
| 1534 | Provider.parseModel | Parse model string from command |
| 1542 | Provider.parseModel | Parse model string from input |
| 1547 | Provider.getModel | Validate model exists |
| 1549 | Provider.ModelNotFoundError.isInstance | Check for model not found error |
| 1644 | Provider.getModel | Get model from agent config |
| 1646 | Provider.getSmallModel | Get small model for sub-tasks |
| 1646 | Provider.getModel | Fallback to full model if no small |

### config/config.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 718 | Provider (type ref) | Type for config provider schema |

### cli/error.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 10 | Provider.ModelNotFoundError.isInstance | Check error type for CLI display |
| 19 | Provider.InitError.isInstance | Check error type for CLI display |

### acp/agent.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 658 | Provider.sort | Sort models for display |
| 772 | Provider.parseModel | Parse model ID from params |
| 994 | Provider.parseModel | Parse model from config |
| 1022 | Provider (property access) | Check opencode provider models |
| 1025 | Provider.sort | Sort opencode provider models |
| 1035 | Provider.sort | Sort models for best selection |

### agent/agent.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 183 | Provider.parseModel | Parse model from agent value |
| 218 | Provider.defaultModel | Get default model for agent |
| 219 | Provider.getModel | Get model instance |
| 220 | Provider.getLanguage | Get language model for agent |

### server/server.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 83 | Provider.ModelNotFoundError | Check error type for status code |
| 1722 | Provider.Info (type) | Schema for provider list response |
| 1733 | Provider.list | List all providers |
| 1736 | Provider.sort | Sort models for default selection |
| 1753 | Provider (type) | Schema for all providers response |
| 1776 | Provider.list | Get connected providers |
| 1778 | Provider.fromModelsDevProvider | Convert models.dev to provider format |
| 1783 | Provider.sort | Sort models for default selection |

### cli/cmd/agent.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 123 | Provider.parseModel | Parse model from CLI args |

### cli/cmd/github.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 645 | Provider.parseModel | Parse model for GitHub integration |

### cli/cmd/tui/app.tsx

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 232 | Provider.parseModel | Parse model from TUI args |

### cli/cmd/models.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 37 | Provider.list | List all providers for models command |

### cli/cmd/run.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 264 | Provider.parseModel | Parse model from run command args |

### cli/cmd/tui/context/local.tsx

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 143 | Provider.parseModel | Parse model from TUI args |
| 153 | Provider.parseModel | Parse model from sync data config |

**Note**: Line 153 uses `Provider.parseModel(sync.data.config.model)` to parse the model string from the synchronized configuration data.

---

## ProviderTransform Namespace Usages

### session/llm.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 85 | ProviderTransform.smallOptions | Get small model options |
| 89 | ProviderTransform.options | Build provider options for request |
| 107 | ProviderTransform.temperature | Get default temperature for model |
| 109 | ProviderTransform.topP | Get default topP for model |
| 110 | ProviderTransform.topK | Get default topK for model |
| 119 | ProviderTransform.maxOutputTokens | Calculate max output tokens |
| 158 | ProviderTransform.providerOptions | Wrap options in provider namespace |
| 191 | ProviderTransform.message | Normalize messages for provider |

### session/prompt.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 689 | ProviderTransform.schema | Transform schema for provider |

### session/message-v2.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 647 | ProviderTransform.error | Transform error message for display |

### provider/provider.ts (internal)

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 589 | ProviderTransform.variants | Get variants for model |
| 731 | ProviderTransform.variants | Merge variants with config |

---

## ProviderAuth Namespace Usages

### server/server.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 1799 | ProviderAuth.Method (type) | Schema for auth methods response |
| 1806 | ProviderAuth.methods | Get available auth methods |
| 1820 | ProviderAuth.Authorization (type) | Schema for authorization response |
| 1842 | ProviderAuth.authorize | Start authorization flow |
| 1883 | ProviderAuth.callback | Handle auth callback |

---

## ModelsDev Namespace Usages

### config/config.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 718 | ModelsDev.Provider (type) | Schema for provider config |
| 725 | ModelsDev.Model (type) | Schema for model config |

### server/server.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 1753 | ModelsDev.Provider (type) | Schema for all providers response |
| 1768 | ModelsDev.get | Get all models from models.dev |

### provider/models.ts (internal)

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 107 | ModelsDev.refresh | Periodic refresh interval |

### provider/transform.ts (internal)

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 8 | ModelsDev.Model (type) | Type for modality extraction |

### provider/provider.ts (internal)

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 528 | ModelsDev.Provider (type) | Type for model conversion |
| 528 | ModelsDev.Model (type) | Type for model conversion |
| 594 | ModelsDev.Provider (type) | Type for provider conversion |
| 608 | ModelsDev.get | Get models from models.dev |

### cli/cmd/models.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 30 | ModelsDev.refresh | Force refresh models |

### cli/cmd/auth.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 181 | ModelsDev.get | Get database for auth display |
| 254 | ModelsDev.refresh | Refresh after auth setup |
| 261 | ModelsDev.get | Get providers for auth selection |
| 389 | ModelsDev.get | Get database for provider lookup |

### cli/cmd/github.ts

| Line | Function Called | Purpose |
|------|-----------------|---------|
| 204 | ModelsDev.get | Get providers for GitHub integration |

---

## Migration Impact Analysis

### High Priority (Core Functionality)

| Consumer | Risk | Migration Notes |
|----------|------|-----------------|
| session/llm.ts | Critical | Central LLM streaming; uses getLanguage, getProvider, all transforms |
| session/prompt.ts | Critical | Prompt building; uses getModel, parseModel, defaultModel, schema |
| agent/agent.ts | Critical | Agent initialization; uses getModel, getLanguage, parseModel |

### Medium Priority (Features)

| Consumer | Risk | Migration Notes |
|----------|------|-----------------|
| server/server.ts | High | API endpoints; uses list, sort, fromModelsDevProvider, auth |
| acp/agent.ts | High | ACP agent; uses parseModel, sort |
| session/summary.ts | Medium | Summary generation; uses getSmallModel, getModel |
| session/compaction.ts | Medium | Context compaction; uses getModel |

### Low Priority (CLI/UI)

| Consumer | Risk | Migration Notes |
|----------|------|-----------------|
| cli/cmd/*.ts | Low | CLI commands; mostly parseModel |
| cli/cmd/tui/*.tsx | Low | TUI components; mostly parseModel |
| cli/error.ts | Low | Error handling; error type checks |

---

## Function Migration Map

| Old Function | New Pattern | Affected Files |
|--------------|-------------|----------------|
| Provider.getModel(pID, mID) | models.getOrThrow(pID, mID) | 14 files |
| Provider.getLanguage(model) | registry.getSDK(provider).then(sdk => provider.getModel(sdk, model.id)) | 2 files |
| Provider.getProvider(pID) | registry.get(pID) | 2 files |
| Provider.list() | registry.listAvailable() | 3 files |
| Provider.defaultModel() | models.default() | 2 files |
| Provider.getSmallModel(pID) | models.small(pID) | 2 files |
| Provider.parseModel(str) | models.parse(str) | 9 files |
| Provider.sort(modelList) | models.sort(modelList) | 4 files |
| Provider.closest(pID, queries) | models.closest(pID, queries) | 0 files (unused) |
| Provider.fromModelsDevProvider(p) | (internal conversion) | 1 file |
| Provider.ModelNotFoundError | ModelNotFoundError | 3 files |
| Provider.InitError | ProviderInitError | 1 file |
| ProviderTransform.message(msgs, model) | provider.normalizeMessages(msgs, model) | 1 file |
| ProviderTransform.options(model, sid, opts) | provider.buildOptions({ model, sessionID: sid, userOptions: opts }) | 1 file |
| ProviderTransform.variants(model) | provider.variants(model) | 2 files |
| ProviderTransform.providerOptions(model, opts) | provider.wrapOptions(opts) | 1 file |
| ProviderTransform.schema(model, schema) | provider.transformSchema(schema, model) | 1 file |
| ProviderTransform.error(pID, err) | provider.transformError(err) | 1 file |
| ProviderTransform.temperature(model) | provider.defaults().temperature | 1 file |
| ProviderTransform.topP(model) | provider.defaults().topP | 1 file |
| ProviderTransform.topK(model) | provider.defaults().topK | 1 file |
| ProviderTransform.maxOutputTokens(...) | provider.calculateMaxOutputTokens(...) | 1 file |
| ProviderTransform.smallOptions(model) | provider.buildSmallModelOptions(model) | 1 file |
| ModelsDev.get() | models.list() (for raw) or via registry | 5 files |
| ModelsDev.refresh() | models.refresh() | 2 files |
| ProviderAuth.methods() | (preserved) | 1 file |
| ProviderAuth.authorize(...) | (preserved) | 1 file |
| ProviderAuth.callback(...) | (preserved) | 1 file |

---

## Provider Analysis Documentation Status

### Documented Providers (14)

| Provider | Analysis File | Completeness |
|----------|---------------|--------------|
| amazon-bedrock | amazon-bedrock.md | Complete |
| anthropic | anthropic.md | Complete |
| azure | azure.md | Complete |
| azure-cognitive-services | azure-cognitive-services.md | Complete |
| cerebras | cerebras.md | Complete |
| cloudflare-ai-gateway | cloudflare-ai-gateway.md | Complete |
| github-copilot | github-copilot.md | Complete |
| google | google.md | Complete |
| google-vertex | google-vertex.md | Complete |
| groq | groq.md | Complete |
| mistral | mistral.md | Complete |
| openai | openai.md | Complete |
| opencode | opencode.md | Complete |
| openrouter | openrouter.md | Complete |

### Undocumented Providers (Gaps)

| Provider | Type | Notes |
|----------|------|-------|
| xai | Bundled | @ai-sdk/xai |
| deepinfra | Bundled | @ai-sdk/deepinfra |
| cohere | Bundled | @ai-sdk/cohere |
| gateway | Bundled | @ai-sdk/gateway |
| togetherai | Bundled | @ai-sdk/togetherai |
| perplexity | Bundled | @ai-sdk/perplexity |
| vercel | Bundled + Custom Loader | @ai-sdk/vercel |
| github-copilot-enterprise | Custom Loader | Inherits from github-copilot |
| google-vertex-anthropic | Custom Loader | @ai-sdk/google-vertex/anthropic |
| sap-ai-core | Custom Loader | Enterprise integration |
| zenmux | Custom Loader | Gateway provider |

---

## Notes

1. **Provider.parseModel** is the most frequently used function (9 files) - used for model string parsing across CLI, TUI, and core.

2. **Provider.getModel** is second most common (14 occurrences) - fundamental for model lookup.

3. **ProviderAuth** is isolated to server/server.ts - auth flows are contained.

4. **ModelsDev** is primarily internal with some CLI usage - refresh and get are main functions.

5. **Error types** (ModelNotFoundError, InitError) are used in 3 locations for error handling.

6. The **internal usages** in provider/provider.ts and provider/transform.ts will be eliminated during rewrite as they are self-referential.
