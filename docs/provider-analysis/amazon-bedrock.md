# Amazon Bedrock Provider Analysis

## Overview
Amazon Bedrock is a fully managed service providing access to foundation models through a unified API. The OpenCode implementation provides comprehensive support for Bedrock models with sophisticated region-aware model ID prefixing to handle cross-region inference profiles, credential management via AWS credential provider chains, and prompt caching integration.

## Implementation Locations

### Core Files
| File | Lines | Purpose |
|------|-------|---------|
| `packages/opencode/src/provider/provider.ts` | 44, 170-302 | SDK registration and custom loader implementation |
| `packages/opencode/src/provider/transform.ts` | 362-374, 519-522 | Message caching and provider options transformation |
| `packages/opencode/src/provider/auth.ts` | N/A | Auth infrastructure (ProviderAuth namespace) |
| `packages/opencode/src/cli/cmd/auth.ts` | 336-346 | CLI authentication guidance for Bedrock |
| `packages/opencode/src/session/index.ts` | 401, 418 | Session metadata handling for Bedrock cache metrics |
| `packages/opencode/package.json` | 53 | Dependency: `@ai-sdk/amazon-bedrock@3.0.57` |

### Integration Points
| File | Lines | Purpose |
|------|-------|---------|
| `packages/ui/src/components/provider-icons/types.ts` | N/A | Provider icon registration |
| `packages/opencode/test/provider/amazon-bedrock.test.ts` | 1-206 | Comprehensive test suite |
| `packages/opencode/test/session/fixtures/models-api.json` | 30641-30646 | Model database configuration |

## Design

### SDK Integration
The Amazon Bedrock provider is integrated through `createAmazonBedrock` from the `@ai-sdk/amazon-bedrock` package (line 18 import, line 44 registration). The provider is registered in the `BUNDLED_PROVIDERS` map (line 44) as `@ai-sdk/amazon-bedrock`, enabling direct SDK loading without dynamic installation.

**Type Interface** (line 18):
```typescript
import { createAmazonBedrock, type AmazonBedrockProviderSettings } from "@ai-sdk/amazon-bedrock"
```

The provider is instantiated with `AmazonBedrockProviderSettings` containing:
- `region`: AWS region for model access
- `credentialProvider`: AWS credential provider chain
- `baseURL`: Optional custom endpoint for VPC/private endpoints

### Custom Loader
The `amazon-bedrock` custom loader (lines 170-302) is one of the most complex in the codebase, implementing sophisticated initialization logic:

**Initialization Phase (lines 170-218)**:
1. Retrieves config from `opencode.json` and auth system
2. Implements three-tier region resolution precedence (lines 176-179):
   - Config file option (`provider.amazon-bedrock.options.region`)
   - Environment variable (`AWS_REGION`)
   - Default to `us-east-1`
3. Implements two-tier profile resolution (lines 181-184):
   - Config file option (`provider.amazon-bedrock.options.profile`)
   - Environment variable (`AWS_PROFILE`)
4. Supports Bearer token authentication via `AWS_BEARER_TOKEN_BEDROCK` env var or stored auth (lines 188-196)
5. Validates availability of credentials: profile, access key ID, or bearer token (line 198)
6. Installs AWS credential provider from `@aws-sdk/credential-providers` (line 200)
7. Builds `credentialProvider` using `fromNodeProviderChain()` with optional profile (lines 202-207)
8. Optionally adds custom endpoint for VPC/private endpoints (lines 210-214)

**Model Loader Phase (lines 219-301)**:
The `getModel` function applies complex region-aware model ID prefixing logic:

**Cross-Region Inference Skip (lines 220-223)**:
- Models with `global.` or `jp.` prefixes skip region prefixing (already using cross-region inference profiles)

**Region-Based Prefixing Strategy (lines 225-297)**:

1. **US Region** (lines 233-247):
   - Extracts first segment of region (e.g., "us" from "us-east-1")
   - Models requiring prefixing: `nova-micro`, `nova-lite`, `nova-pro`, `nova-premier`, `claude`, `deepseek`
   - Excludes govCloud regions from prefixing
   - Format: `us.{modelID}`

2. **EU Region** (lines 249-265):
   - Checks if region is in supported EU regions: `eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-north-1`, `eu-central-1`, `eu-south-1`, `eu-south-2`
   - Models requiring prefixing: `claude`, `nova-lite`, `nova-micro`, `llama3`, `pixtral`
   - Only applies prefix if BOTH region and model match requirements
   - Format: `eu.{modelID}`

3. **AP/APAC Region** (lines 267-295):
   - Detects Australia regions: `ap-southeast-2`, `ap-southeast-4`
     - Models: `anthropic.claude-sonnet-4-5`, `anthropic.claude-haiku`
     - Prefix: `au.` (special case, replaces "ap")
   - Detects Tokyo region: `ap-northeast-1`
     - Models requiring prefixing: `claude`, `nova-lite`, `nova-micro`, `nova-pro`
     - Prefix: `jp.` (cross-region inference)
   - Other APAC regions (lines 286-292):
     - Models requiring prefixing: `claude`, `nova-lite`, `nova-micro`, `nova-pro`
     - Prefix: `apac.` (cross-region inference)

**Return** (lines 216-301):
Returns object with:
- `autoload: true` - provider auto-loads when credentials available
- `options: AmazonBedrockProviderSettings` - provider configuration
- `getModel` function - applies region-aware model ID prefixing

### Configuration

**Environment Variables**:
- `AWS_REGION` - AWS region (fallback to `us-east-1` if not set)
- `AWS_PROFILE` - AWS profile name (optional, uses default chain if absent)
- `AWS_ACCESS_KEY_ID` - Direct credential (optional, part of credential chain)
- `AWS_BEARER_TOKEN_BEDROCK` - Bearer token for authentication (alternative to AWS credentials)

**Config File Options** (opencode.json):
```json
{
  "provider": {
    "amazon-bedrock": {
      "options": {
        "region": "eu-west-1",
        "profile": "custom-profile",
        "endpoint": "https://bedrock-runtime.us-east-1.vpce-xxxxx.amazonaws.com",
        "baseURL": "https://custom-endpoint.com"
      }
    }
  }
}
```

**Authentication Methods**:
1. AWS credential provider chain (default):
   - AWS credentials from environment variables or credential files
   - IAM instance roles (EC2, ECS, Lambda)
   - SSO profiles configured in AWS credentials/config files
2. Bearer token authentication:
   - Via `AWS_BEARER_TOKEN_BEDROCK` environment variable
   - Via auth system (`Auth.get("amazon-bedrock")`)
3. Precedence order documented in CLI (auth.ts line 338-342):
   - Bearer token (highest priority)
   - AWS credential chain
   - Config options

## Interfaces

### Provider Options Schema
```typescript
type AmazonBedrockProviderSettings = {
  region: string                           // AWS region (default: us-east-1)
  credentialProvider: CredentialProvider   // AWS credential provider chain
  baseURL?: string                         // Optional custom endpoint
}
```

**Custom Loader Return Type** (lines 68-72):
```typescript
type CustomLoader = (provider: Info) => Promise<{
  autoload: boolean
  getModel?: CustomModelLoader
  options?: Record<string, any>
}>
```

### Model Configuration
Models are loaded from `@ai-sdk/amazon-bedrock` SDK and registered in models database (models-api.json lines 30641-30646):
```json
{
  "amazon-bedrock": {
    "id": "amazon-bedrock",
    "name": "Amazon Bedrock",
    "npm": "@ai-sdk/amazon-bedrock",
    "api": "https://bedrock-runtime.{region}.amazonaws.com",
    "doc": "https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html"
  }
}
```

## Process Flows

### Initialization Flow
```
1. Provider.list() called
   ↓
2. CUSTOM_LOADERS["amazon-bedrock"] invoked (line 811-821)
   ↓
3. Config loaded (Config.get())
   ↓
4. Region resolution (config > env > default)
   ↓
5. Profile resolution (config > env)
   ↓
6. Credential validation (profile || accessKeyId || bearerToken)
   ↓
7. AWS SDK credential provider installed
   ↓
8. fromNodeProviderChain() configured with optional profile
   ↓
9. Custom endpoint applied if specified
   ↓
10. Provider.options populated with region, credentialProvider, baseURL
    ↓
11. getModel loader registered for region-aware prefixing
    ↓
12. Provider enabled (autoload: true) and models populated
```

### Request Flow
```
1. User requests model (e.g., "amazon-bedrock/claude-3-sonnet")
   ↓
2. Provider.getLanguage() calls getSDK() → instantiates bundled provider
   ↓
3. Provider initialization uses credentialProvider to authenticate
   ↓
4. getModel("claude-3-sonnet") called with options.region
   ↓
5. Region-aware prefixing applied:
   - Check for existing cross-region inference prefix
   - Apply appropriate prefix based on region and model
   - Example: "claude-3-sonnet" → "us.claude-3-sonnet" (US region)
   ↓
6. sdk.languageModel(prefixedModelID) returns model instance
   ↓
7. Model instance used for generation with implicit AWS auth via credentialProvider
```

## Transform Logic

### Message Caching (lines 362-374, 519-522)
Bedrock supports prompt caching with ephemeral cache points. Cache configuration applied by `applyCaching()` (lines 141-181):

**Bedrock Cache Point Format** (lines 152-154):
```typescript
bedrock: {
  cachePoint: { type: "ephemeral" }
}
```

This is applied to system messages (up to 2) and final messages (last 2) to enable cost-effective prompt caching while maintaining conversation context.

### Provider Options Transform (lines 519-522)
Bedrock-specific options are wrapped under the `bedrock` key for compatibility with underlying transport layer:
```typescript
case "@ai-sdk/amazon-bedrock":
  return {
    ["bedrock" as string]: options,
  }
```

### Reasoning Variants (lines 362-374)
Bedrock supports extended thinking with the `reasoningConfig` structure:
```typescript
case "@ai-sdk/amazon-bedrock":
  return Object.fromEntries(
    WIDELY_SUPPORTED_EFFORTS.map((effort) => [
      effort,
      {
        reasoningConfig: {
          type: "enabled",
          maxReasoningEffort: effort,
        },
      },
    ]),
  )
```
Supported efforts: `low`, `medium`, `high`

### Session Metadata Caching (lines 401, 418)
Session tracks Bedrock-specific cache metrics:
```typescript
const excludesCachedTokens = !!(input.metadata?.["anthropic"] || input.metadata?.["bedrock"])
// Cache metrics extracted from metadata
input.metadata?.["bedrock"]?.["usage"]?.["cacheWriteInputTokens"]
```

## Key Design Decisions

1. **Sophisticated Region-Aware Prefixing**: Rather than a simple regex replacement, the loader implements region-specific rules because Bedrock's cross-region inference uses different prefix conventions (us., eu., jp., apac., au.) depending on region and model combination. This prevents unnecessary API failures.

2. **Credential Provider Chain**: Uses AWS SDK's standard `fromNodeProviderChain()` rather than manually parsing credentials, leveraging built-in support for profiles, environment variables, IAM roles, and SSO - providing production-grade credential handling without code duplication.

3. **Autoload with Validation**: Sets `autoload: true` only when credentials are available (line 198: `if (!profile && !awsAccessKeyId && !awsBearerToken) return { autoload: false }`), ensuring provider appears only to users with valid AWS access.

4. **Custom Endpoint Support**: Supports both `endpoint` (preferred) and `baseURL` options for VPC endpoints and private connectivity, essential for enterprise deployments (lines 210-214).

5. **Bearer Token Integration**: Supports `AWS_BEARER_TOKEN_BEDROCK` for use cases where AWS credential management is not feasible (e.g., CI/CD with temporary tokens), complementing standard credential chain.

6. **Config Precedence Hierarchy**: Implements explicit precedence rules (config > env > default) for both region and profile, documented in tests (amazon-bedrock.test.ts), preventing ambiguous behavior.

## Notes

- **Model Availability**: Not all Bedrock models are available in all regions. Region-aware prefixing handles cross-region inference when models aren't available locally.
- **Government Cloud**: Special handling for govCloud regions prevents unnecessary prefixing, reflecting AWS-specific compliance requirements (line 243).
- **Cache Metrics**: Session metadata integration enables tracking of cache hit rates and cost optimization opportunities via `cacheWriteInputTokens` and related metrics.
- **Test Coverage**: Comprehensive test suite (amazon-bedrock.test.ts) validates region precedence, profile precedence, bearer token handling, and custom endpoint configuration.
- **Endpoint Options**: The dual support for both `endpoint` and `baseURL` (line 211) provides flexibility for different deployment scenarios without breaking existing configurations.
- **Package Dependency**: Uses `@ai-sdk/amazon-bedrock@3.0.57`, pinned to ensure stable cross-region inference behavior.
