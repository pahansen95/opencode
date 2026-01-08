# Provider Protocol Migration Plan

## Executive Summary

Phased migration of OpenCode's provider implementation from monolithic namespace-based architecture to decoupled protocol-based architecture. Estimated 8 phases over continuous development cycles.

**Goals**:
- Zero breaking changes until final phase
- Incremental value delivery at each phase
- Comprehensive test coverage before each transition
- Feature flag gated rollout for risk mitigation

**Non-Goals**:
- Timeline estimates (per CLAUDE.md constraints)
- Feature additions beyond protocol migration
- Provider behavior changes (parity with current implementation)

---

## Current State Analysis

### Architecture
```
packages/opencode/src/provider/
├── provider.ts      (1,135 lines) - Monolithic: loaders, SDK, state, resolution
├── transform.ts     (648 lines)   - Switch-based transformations
├── auth.ts          (143 lines)   - OAuth/API key management
├── models.ts        (106 lines)   - models.dev API client
└── sdk/             (~2,000 lines) - GitHub Copilot custom SDK
```

### Coupling Points
| Consumer | Imports | Call Sites |
|----------|---------|------------|
| session/llm.ts | Provider, ProviderTransform | 12 |
| session/prompt.ts | Provider, ProviderTransform | 11 |
| session/summary.ts | Provider | 4 |
| session/compaction.ts | Provider | 2 |
| agent/agent.ts | Provider | 4 |
| acp/agent.ts | Provider | 5 |
| server/server.ts | Provider, ProviderAuth, ModelsDev | 12 |
| cli/cmd/*.ts | Provider, ModelsDev | 8 |
| **Total** | | **58+** |

### Provider Complexity Ranking
1. **amazon-bedrock** - Region prefixes, AWS credential chain, cross-region inference
2. **github-copilot** - OAuth plugin, dual routing, custom SDK
3. **openai** - Responses API, session caching, encrypted reasoning
4. **anthropic** - Beta headers, thinking budgets, message filtering
5. **google-vertex** - ADC, thinkingConfig variants, schema sanitization
6. **azure** - Reasoning encryption, completion URLs
7. **openrouter** - Multi-model gateway, caching
8. **cloudflare** - Custom fetch, header remapping
9. **cerebras/groq/mistral** - Minimal customization

---

## Target Architecture

```
packages/opencode/src/provider/
├── protocol.ts              # Interface definitions (Section 1-8 of stubs)
├── registry.ts              # ProviderRegistry implementation
├── router.ts                # ProviderRouter + strategies
├── models.ts                # ModelRegistry (refactored)
├── health.ts                # HealthMonitor implementation
├── usage.ts                 # UsageTracker implementation
├── facade.ts                # Backward-compatible Provider namespace
├── transform-facade.ts      # Backward-compatible ProviderTransform namespace
├── base.ts                  # BaseProvider abstract class
├── instance.ts              # Singleton instances (registry, router, models)
├── errors.ts                # Error classes
│
├── providers/               # Individual provider implementations
│   ├── anthropic.ts
│   ├── openai.ts
│   ├── amazon-bedrock.ts
│   ├── azure.ts
│   ├── google.ts
│   ├── google-vertex.ts
│   ├── github-copilot.ts
│   ├── cloudflare.ts
│   ├── openrouter.ts
│   ├── groq.ts
│   ├── mistral.ts
│   ├── cerebras.ts
│   └── index.ts             # Bundled provider registration
│
└── sdk/                     # Custom SDK implementations (unchanged)
    └── openai-compatible/
```

---

## Phase 0: Preparation

### Objective
Establish infrastructure for migration without changing runtime behavior.

### Tasks

#### 0.1 Documentation
- [ ] Finalize protocol stubs (docs/provider-protocol-stubs.ts)
- [ ] Document current provider behaviors (one doc per provider)
- [ ] Create migration tracking issue/project

#### 0.2 Test Infrastructure
- [ ] Audit existing provider tests
- [ ] Create provider integration test harness
- [ ] Define test coverage requirements (target: 80% per provider)
- [ ] Set up mock provider for testing

#### 0.3 Feature Flags
- [ ] Add `OPENCODE_PROVIDER_PROTOCOL_V2` environment variable
- [ ] Add `experimental.provider_protocol_v2` config option
- [ ] Create feature flag utility: `isProtocolV2Enabled()`

#### 0.4 Metrics
- [ ] Add provider call instrumentation to current implementation
- [ ] Establish baseline metrics (latency, error rates, usage patterns)
- [ ] Set up A/B comparison infrastructure

### Deliverables
- Migration tracking system
- Test harness ready
- Feature flag infrastructure
- Baseline metrics collection

### Exit Criteria
- [ ] All providers documented
- [ ] Test harness runs against current implementation
- [ ] Feature flags deployed (disabled)
- [ ] Baseline metrics for 1 week collected

---

## Phase 1: Foundation

### Objective
Implement core protocol interfaces and base infrastructure.

### Tasks

#### 1.1 Protocol Interfaces
- [ ] Create `protocol.ts` from stubs (Sections 1-8)
- [ ] Create `errors.ts` with error classes
- [ ] Export types from `index.ts`

#### 1.2 Base Provider
- [ ] Implement `BaseProvider` abstract class
- [ ] Include utility methods (sanitizeToolCallId, filterEmptyMessages)
- [ ] Add comprehensive JSDoc

#### 1.3 Registry Stub
- [ ] Create `registry.ts` with `ProviderRegistry` interface
- [ ] Implement in-memory provider storage
- [ ] Add SDK caching logic (ported from current provider.ts)

#### 1.4 Model Registry Stub
- [ ] Create `ModelRegistry` interface implementation
- [ ] Port `ModelsDev.get()` and `ModelsDev.refresh()`
- [ ] Implement `parse()`, `sort()`, `closest()`, `default()`, `small()`

### Deliverables
```typescript
// New files
src/provider/protocol.ts      // ~600 lines (interfaces only)
src/provider/errors.ts        // ~100 lines
src/provider/base.ts          // ~200 lines
src/provider/registry.ts      // ~150 lines (stub)
src/provider/model-registry.ts // ~200 lines
```

### Exit Criteria
- [ ] All interfaces compile without errors
- [ ] BaseProvider can be extended
- [ ] Registry stores/retrieves providers
- [ ] ModelRegistry passes existing model resolution tests

---

## Phase 2: Facade Layer

### Objective
Create backward-compatible facades that delegate to new infrastructure.

### Tasks

#### 2.1 Provider Facade
- [ ] Create `facade.ts` exporting `Provider` namespace
- [ ] Implement all current `Provider.*` functions
- [ ] Delegate to registry/model-registry internally
- [ ] Maintain exact API compatibility

#### 2.2 Transform Facade
- [ ] Create `transform-facade.ts` exporting `ProviderTransform` namespace
- [ ] Route transform calls through provider protocol
- [ ] Fall back to current implementation when protocol provider unavailable

#### 2.3 Auth Facade
- [ ] Create `auth-facade.ts` exporting `ProviderAuth` namespace
- [ ] Maintain current auth flow
- [ ] Prepare hooks for protocol-based auth

#### 2.4 Instance Module
- [ ] Create `instance.ts` with singleton instances
- [ ] Initialize registry, router, model-registry
- [ ] Handle feature flag switching

### Deliverables
```typescript
// New files
src/provider/facade.ts           // ~300 lines
src/provider/transform-facade.ts // ~250 lines
src/provider/auth-facade.ts      // ~100 lines
src/provider/instance.ts         // ~50 lines

// Modified files
src/provider/index.ts            // Re-export facades
```

### Verification
```typescript
// Before (current)
import { Provider } from "@/provider/provider"
const model = Provider.getModel("anthropic", "claude-sonnet-4")

// After (facade - same API)
import { Provider } from "@/provider"
const model = Provider.getModel("anthropic", "claude-sonnet-4")
```

### Exit Criteria
- [ ] All existing tests pass with facade
- [ ] No consumer code changes required
- [ ] Feature flag switches between old/new paths
- [ ] Facade delegates to registry when available

---

## Phase 3: Provider Extraction

### Objective
Extract provider-specific logic into individual protocol implementations.

### Strategy
Extract in order of increasing complexity:
1. Simple providers (minimal custom logic)
2. OpenAI-compatible providers (shared base)
3. Complex providers (unique authentication, routing)

### Sub-Phases

#### 3.1 Simple Providers
Extract providers with minimal customization.

| Provider | Custom Logic | Estimated Lines |
|----------|--------------|-----------------|
| cerebras | Header injection | ~80 |
| groq | Thinking config | ~100 |
| mistral | Tool ID normalization, message sequence | ~120 |

**Tasks per provider**:
- [ ] Create `providers/{name}.ts`
- [ ] Extend `BaseProvider`
- [ ] Implement required abstract methods
- [ ] Port custom logic from `CUSTOM_LOADERS`
- [ ] Port transforms from `transform.ts`
- [ ] Register in `providers/index.ts`
- [ ] Write unit tests
- [ ] Verify via facade

#### 3.2 OpenAI-Compatible Providers
Extract providers sharing OpenAI-compatible base.

| Provider | Custom Logic | Estimated Lines |
|----------|--------------|-----------------|
| openai | Responses API, session caching | ~150 |
| azure | Completion URLs, reasoning encryption | ~130 |
| azure-cognitive | Resource URL construction | ~100 |
| openrouter | Multi-model gateway, headers | ~120 |
| cloudflare | Custom fetch, header stripping | ~110 |

**Tasks**:
- [ ] Create `providers/openai-compatible-base.ts`
- [ ] Extract shared OpenAI-compatible logic
- [ ] Implement each provider extending base
- [ ] Port provider-specific transforms
- [ ] Write integration tests

#### 3.3 Google Providers
Extract Google/Vertex providers with ADC support.

| Provider | Custom Logic | Estimated Lines |
|----------|--------------|-----------------|
| google | ThinkingConfig, schema sanitization | ~140 |
| google-vertex | ADC, project/location config | ~160 |
| google-vertex-anthropic | Subpath import, hybrid | ~100 |

**Tasks**:
- [ ] Create `providers/google-base.ts` for shared logic
- [ ] Implement schema sanitization utility
- [ ] Handle ADC credential resolution
- [ ] Test with real credentials (manual)

#### 3.4 Complex Providers
Extract providers with unique complexity.

| Provider | Custom Logic | Estimated Lines |
|----------|--------------|-----------------|
| anthropic | Beta headers, thinking budgets, message filtering | ~180 |
| github-copilot | OAuth plugin, dual routing, custom SDK | ~220 |
| github-copilot-enterprise | Enterprise variant | ~80 |
| amazon-bedrock | AWS creds, region prefixes, cross-region | ~250 |

**Tasks**:
- [ ] Extract Anthropic (highest usage, well-understood)
- [ ] Extract GitHub Copilot (requires custom SDK integration)
- [ ] Extract Amazon Bedrock (most complex auth)
- [ ] Extensive integration testing

### Deliverables
```
src/provider/providers/
├── index.ts                    # Registration
├── cerebras.ts                 # ~80 lines
├── groq.ts                     # ~100 lines
├── mistral.ts                  # ~120 lines
├── openai-compatible-base.ts   # ~150 lines
├── openai.ts                   # ~150 lines
├── azure.ts                    # ~130 lines
├── azure-cognitive.ts          # ~100 lines
├── openrouter.ts               # ~120 lines
├── cloudflare.ts               # ~110 lines
├── google-base.ts              # ~100 lines
├── google.ts                   # ~140 lines
├── google-vertex.ts            # ~160 lines
├── google-vertex-anthropic.ts  # ~100 lines
├── anthropic.ts                # ~180 lines
├── github-copilot.ts           # ~220 lines
├── github-copilot-enterprise.ts # ~80 lines
└── amazon-bedrock.ts           # ~250 lines
```

### Exit Criteria (per sub-phase)
- [ ] All extracted providers pass unit tests
- [ ] Facade correctly routes to new implementations
- [ ] Feature flag enables/disables new providers
- [ ] No regression in integration tests
- [ ] Manual testing with real credentials

---

## Phase 4: Router Implementation

### Objective
Implement provider routing infrastructure.

### Tasks

#### 4.1 Router Interface
- [ ] Create `router.ts` with `ProviderRouter` implementation
- [ ] Implement default routing strategy (capability-based)
- [ ] Add fallback chain support

#### 4.2 Routing Strategies
- [ ] Implement `CapabilityRouter` (default)
- [ ] Implement `CostOptimizedRouter`
- [ ] Implement `LatencyOptimizedRouter`
- [ ] Implement `ConfigDrivenRouter`

#### 4.3 Health Monitoring
- [ ] Create `health.ts` with `HealthMonitor` implementation
- [ ] Implement circuit breaker pattern
- [ ] Add health status caching

#### 4.4 Usage Tracking
- [ ] Create `usage.ts` with `UsageTracker` implementation
- [ ] Integrate with existing session metadata
- [ ] Add provider statistics aggregation

### Deliverables
```typescript
src/provider/router.ts    // ~300 lines
src/provider/strategies/  // ~400 lines total
├── capability.ts
├── cost.ts
├── latency.ts
└── config.ts
src/provider/health.ts    // ~200 lines
src/provider/usage.ts     // ~250 lines
```

### Exit Criteria
- [ ] Router selects appropriate provider for task type
- [ ] Fallback works when primary provider fails
- [ ] Health monitor tracks provider status
- [ ] Usage tracker records all requests

---

## Phase 5: Consumer Migration

### Objective
Update major consumers to use protocol directly (optional path).

### Strategy
Maintain facade support but enable direct protocol usage for:
- New features requiring routing
- Performance-critical paths
- Features needing capability introspection

### Tasks

#### 5.1 Session Module (Highest Impact)
- [ ] Update `session/llm.ts` to optionally use router
- [ ] Add multi-provider session support
- [ ] Integrate usage tracking

#### 5.2 Agent Module
- [ ] Update `agent/agent.ts` for capability-based model selection
- [ ] Add agent-specific routing preferences

#### 5.3 Server Module
- [ ] Add `/providers/:id/capabilities` endpoint
- [ ] Add `/providers/:id/health` endpoint
- [ ] Update provider listing with capabilities

#### 5.4 CLI/TUI
- [ ] Add capability display to `models` command
- [ ] Add provider health status display

### Deliverables
- Updated consumers with protocol support
- New API endpoints
- Enhanced CLI output

### Exit Criteria
- [ ] Consumers work with both facade and direct protocol
- [ ] New features functional
- [ ] No regression in existing functionality

---

## Phase 6: Facade Deprecation

### Objective
Deprecate facade and prepare for removal.

### Tasks

#### 6.1 Deprecation Warnings
- [ ] Add deprecation warnings to facade methods
- [ ] Log usage of deprecated paths
- [ ] Document migration guide for each facade method

#### 6.2 Consumer Audit
- [ ] Identify all remaining facade consumers
- [ ] Create migration tasks for each
- [ ] Prioritize by usage frequency

#### 6.3 Documentation
- [ ] Update all documentation to use protocol
- [ ] Create migration guide
- [ ] Update examples

### Deliverables
- Deprecation warnings active
- Complete migration guide
- Updated documentation

### Exit Criteria
- [ ] All first-party consumers migrated
- [ ] Deprecation warnings logged
- [ ] Migration guide complete

---

## Phase 7: Facade Removal

### Objective
Remove facade layer and legacy provider implementation.

### Tasks

#### 7.1 Remove Facade
- [ ] Remove `facade.ts`
- [ ] Remove `transform-facade.ts`
- [ ] Remove `auth-facade.ts`
- [ ] Update `index.ts` exports

#### 7.2 Remove Legacy
- [ ] Remove `CUSTOM_LOADERS` from `provider.ts`
- [ ] Remove switch statements from `transform.ts`
- [ ] Archive legacy code (tag for reference)

#### 7.3 Cleanup
- [ ] Remove feature flags
- [ ] Remove dual-path code
- [ ] Final test pass

### Deliverables
- Clean protocol-only implementation
- Reduced codebase (~40% reduction in provider module)
- Simplified dependency graph

### Exit Criteria
- [ ] No facade references remain
- [ ] All tests pass
- [ ] No regression in functionality
- [ ] Performance metrics maintained or improved

---

## Risk Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provider behavior regression | Medium | High | Comprehensive test coverage, feature flags |
| Performance degradation | Low | Medium | Baseline metrics, A/B comparison |
| Authentication failures | Medium | High | Extensive manual testing, gradual rollout |
| SDK compatibility issues | Low | Medium | Pin SDK versions during migration |

### Process Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | Medium | Strict phase boundaries, no feature additions |
| Extended timeline | Medium | Low | Incremental delivery, each phase standalone |
| Knowledge silos | Medium | Medium | Documentation, pair programming |

### Rollback Strategy

Each phase maintains rollback capability:

1. **Phase 1-2**: Delete new files, no consumer impact
2. **Phase 3**: Disable feature flag, facade falls back to legacy
3. **Phase 4**: Router optional, can bypass
4. **Phase 5**: Consumers maintain facade fallback
5. **Phase 6**: Remove deprecation warnings
6. **Phase 7**: Restore from git tag (last resort)

---

## Success Metrics

### Functional
- [ ] All existing tests pass
- [ ] No provider behavior changes
- [ ] All authentication methods work
- [ ] All providers accessible

### Performance
- [ ] P50 latency within 5% of baseline
- [ ] P99 latency within 10% of baseline
- [ ] Memory usage within 10% of baseline

### Code Quality
- [ ] 80%+ test coverage per provider
- [ ] No circular dependencies
- [ ] Clear separation of concerns
- [ ] Reduced cognitive complexity

### Developer Experience
- [ ] New provider implementation < 200 lines
- [ ] Custom provider via npm package works
- [ ] Clear error messages
- [ ] Comprehensive documentation

---

## Appendix A: File Mapping

### Current → Target

| Current Location | Target Location |
|------------------|-----------------|
| `provider.ts:CUSTOM_LOADERS` | `providers/*.ts` |
| `provider.ts:BUNDLED_PROVIDERS` | `providers/index.ts` |
| `provider.ts:state` | `instance.ts` + `registry.ts` |
| `provider.ts:getModel` | `model-registry.ts` |
| `provider.ts:getLanguage` | `registry.ts:getSDK` + `provider.getModel` |
| `provider.ts:getSDK` | `registry.ts:getSDK` |
| `provider.ts:list` | `registry.ts:listAvailable` |
| `transform.ts:message` | `providers/*.ts:normalizeMessages` |
| `transform.ts:variants` | `providers/*.ts:variants` |
| `transform.ts:options` | `providers/*.ts:buildOptions` |
| `transform.ts:providerOptions` | `providers/*.ts:wrapOptions` |
| `transform.ts:schema` | `providers/*.ts:transformSchema` |
| `transform.ts:error` | `providers/*.ts:transformError` |
| `auth.ts` | `auth-facade.ts` (then protocol auth) |
| `models.ts` | `model-registry.ts` |

---

## Appendix B: Provider Implementation Checklist

Template for each provider extraction:

```markdown
## Provider: {name}

### Source Analysis
- [ ] Document custom loader logic
- [ ] Document transform logic
- [ ] Document authentication flow
- [ ] Document unique behaviors

### Implementation
- [ ] Create `providers/{name}.ts`
- [ ] Extend appropriate base class
- [ ] Implement `authenticate()`
- [ ] Implement `normalizeMessages()`
- [ ] Implement `buildOptions()`
- [ ] Implement `wrapOptions()`
- [ ] Implement `capabilities()`
- [ ] Implement `variants()`
- [ ] Implement `getHeaders()` (if needed)
- [ ] Implement `transformSchema()` (if needed)
- [ ] Implement `transformError()` (if needed)
- [ ] Implement `applyCaching()` (if supported)

### Testing
- [ ] Unit tests for each method
- [ ] Integration test with mock SDK
- [ ] Integration test with real API (manual)
- [ ] Verify via facade passthrough

### Verification
- [ ] Feature flag enables new implementation
- [ ] No behavior change from legacy
- [ ] Error messages match
- [ ] Performance within bounds
```

---

## Appendix C: Consumer Migration Checklist

Template for each consumer module:

```markdown
## Consumer: {module}

### Current Usage
- [ ] List all Provider.* calls
- [ ] List all ProviderTransform.* calls
- [ ] List all type usages
- [ ] Document implicit assumptions

### Migration Path
- [ ] Identify direct protocol opportunities
- [ ] Identify facade-sufficient usages
- [ ] Plan incremental updates

### Implementation
- [ ] Update imports
- [ ] Add capability checks (if routing)
- [ ] Add error handling for new error types
- [ ] Update type annotations

### Testing
- [ ] Existing tests pass
- [ ] New capability tests added
- [ ] Manual verification
```
