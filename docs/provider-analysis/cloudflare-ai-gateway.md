# Cloudflare AI Gateway Provider Analysis

## Overview
Cloudflare AI Gateway is a unified LLM endpoint that provides access to models from OpenAI, Anthropic, Workers AI, and other providers through a single gateway. The OpenCode implementation uses a custom loader to configure the gateway endpoint and handle unified billing through the `cf-aig-authorization` header, which allows Cloudflare to manage upstream provider authentication.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 392-430 | Custom loader for cloudflare-ai-gateway provider, containing initialization logic, authentication handling, and custom fetch implementation |
| `packages/opencode/src/cli/cmd/auth.ts` | 356-360 | Login command help text for cloudflare-ai-gateway provider configuration |
| `packages/web/src/content/docs/providers.mdx` | 395-450 | User documentation for Cloudflare AI Gateway setup and configuration |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/auth.ts` | 1-143 | General authentication framework supporting API-type auth used by cloudflare-ai-gateway |
| `packages/opencode/src/env.ts` | N/A | Environment variable management for CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_GATEWAY_ID, CLOUDFLARE_API_TOKEN |
| `packages/opencode/src/auth.ts` | N/A | Auth storage and retrieval system used to persist Cloudflare API tokens |

## Design

### SDK Integration
The cloudflare-ai-gateway provider does not use a bundled SDK. Instead, it is configured to route requests directly to Cloudflare's gateway endpoint using the `@ai-sdk/openai-compatible` package. The provider is registered in the CUSTOM_LOADERS object (line 74) and is executed as part of the provider initialization state (lines 811-821).

### Custom Loader
The custom loader for cloudflare-ai-gateway is defined at lines 392-430 in provider.ts:

1. **Environment Variable Resolution** (lines 393-396):
   - Retrieves `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_GATEWAY_ID` from environment
   - Returns `{ autoload: false }` if either is missing, preventing provider autoload

2. **Authentication Token Resolution** (lines 398-405):
   - Checks for `CLOUDFLARE_API_TOKEN` environment variable first (priority 1)
   - Falls back to stored authentication from `Auth.get(input.id)` (priority 2)
   - Uses the API token to construct the `cf-aig-authorization` header

3. **Model Loading** (lines 409-411):
   - Custom `getModel()` function delegates to `sdk.languageModel(modelID)`
   - Allows direct model access through the gateway

4. **Custom Fetch Implementation** (lines 423-427):
   - Strips the `Authorization` header before sending requests
   - Necessary because Cloudflare AI Gateway uses `cf-aig-authorization` instead
   - Prevents auth errors from invalid Authorization header values

### Configuration
| Aspect | Details |
|--------|---------|
| **Environment Variables** | `CLOUDFLARE_ACCOUNT_ID` (required): 32-character account ID; `CLOUDFLARE_GATEWAY_ID` (required): Gateway identifier; `CLOUDFLARE_API_TOKEN` (optional): API token for unified billing |
| **Authentication Methods** | API key-based authentication via `/connect` command or direct env var |
| **Base URL** | `https://gateway.ai.cloudflare.com/v1/{accountId}/{gateway}/compat` (line 413) |
| **Custom Headers** | `cf-aig-authorization`: Bearer token for unified billing; `HTTP-Referer`: https://opencode.ai/; `X-Title`: opencode |

## Interfaces

### Provider Options Schema
```typescript
{
  baseURL: string  // https://gateway.ai.cloudflare.com/v1/{accountId}/{gateway}/compat
  headers: {
    "cf-aig-authorization"?: string  // Bearer {apiToken} - only included if apiToken exists
    "HTTP-Referer": string            // https://opencode.ai/
    "X-Title": string                 // opencode
  }
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>  // Custom fetch that strips Authorization
}
```

### Model Configuration
Models are configured through models.dev database and can be extended via opencode.json config. Users can specify models in their opencode.json like:
```json
{
  "provider": {
    "cloudflare-ai-gateway": {
      "models": {
        "openai/gpt-4o": {},
        "anthropic/claude-sonnet-4": {}
      }
    }
  }
}
```

## Process Flows

### Initialization Flow
```
1. Provider.state() initialization (line 605)
   └─> For cloudflare-ai-gateway in CUSTOM_LOADERS (line 811):
       ├─> Check CLOUDFLARE_ACCOUNT_ID env var (line 393)
       ├─> Check CLOUDFLARE_GATEWAY_ID env var (line 394)
       ├─> Return autoload: false if either missing (line 396)
       ├─> Resolve API token:
       │   ├─> Try CLOUDFLARE_API_TOKEN env var (line 400)
       │   └─> Fall back to Auth.get(input.id) (line 402)
       └─> If autoload or provider already exists:
           └─> Merge provider config with:
               ├─> baseURL
               ├─> headers (cf-aig-authorization)
               └─> custom fetch function (line 816-819)
```

### Request Flow
```
1. User requests model from cloudflare-ai-gateway provider
   └─> Provider.getLanguage(model) is called (line 1001)
       └─> getSDK(model) retrieves or creates SDK instance (line 907)
           ├─> Resolves baseURL, apiKey, and headers
           ├─> Sets custom fetch from options (lines 917-939)
           └─> Returns OpenAI-compatible SDK with configuration
       └─> s.modelLoaders[providerID] executes getModel() (line 1010)
           └─> sdk.languageModel(modelID) returns LanguageModelV2
2. Message sent through AI SDK
   └─> Custom fetch intercepts request (line 919)
       ├─> Creates new Headers from init?.headers
       ├─> Deletes Authorization header (line 425)
       ├─> Sends request with cf-aig-authorization instead
       └─> Returns fetch response
```

## Transform Logic
No transform logic specific to cloudflare-ai-gateway. The provider relies on:
- Default ProviderTransform.variants() for model variants (line 589, 731)
- Standard opencode-compatible message handling through the AI SDK

## Key Design Decisions

1. **Custom Fetch Implementation** (lines 423-427):
   - Reason: Cloudflare AI Gateway uses a non-standard header (`cf-aig-authorization`) for authentication instead of the standard OpenAI `Authorization` header
   - Implementation: Intercepts fetch to strip the Authorization header before requests reach the gateway, preventing conflicts

2. **Unified Billing via cf-aig-authorization Header** (lines 415-417):
   - Reason: Enables Cloudflare to handle upstream provider authentication centrally, allowing users to pay Cloudflare instead of multiple providers
   - Implementation: Only includes header if apiToken is available, allowing unauthenticated gateway usage when needed

3. **No Bundled SDK** (line 34 comment in imports):
   - Reason: Uses existing OpenAI-compatible pattern via @ai-sdk/openai-compatible
   - Benefit: Minimal maintenance burden; Cloudflare's compat endpoint is OpenAI-compatible

4. **Environment Variable Required for Autoload** (line 396):
   - Reason: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_GATEWAY_ID are mandatory for gateway configuration
   - Implementation: Provider only autoloas when both env vars are present; otherwise requires manual setup

5. **Authentication Priority** (lines 399-405):
   - Priority 1: CLOUDFLARE_API_TOKEN environment variable (immediate, no user action needed)
   - Priority 2: Stored auth from `/connect` command (user-configured via CLI)
   - This allows both CI/CD automation and interactive setup

## Notes

- The provider integrates with Cloudflare's unified billing system, which is a key architectural feature
- Support message added to auth.ts (line 356-360) directs users to documentation for setup
- Provider documentation at line 395-450 of providers.mdx includes examples of model configuration through opencode.json
- The custom fetch implementation is simple but essential - without it, requests would fail due to header conflicts
- Gateway ID and Account ID are user-specific values obtained from Cloudflare dashboard
- The provider uses OpenAI-compatible API, so model IDs follow patterns like "openai/gpt-4o" or "anthropic/claude-sonnet-4"
