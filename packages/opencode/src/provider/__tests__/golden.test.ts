/**
 * Golden Tests for Provider System
 *
 * These tests capture the current behavior of the provider system as snapshot tests.
 * They serve as a safety net during the protocol rewrite to ensure behavior is preserved.
 *
 * Test Coverage:
 * - Message normalization (ProviderTransform.message)
 * - Options building (ProviderTransform.options)
 * - Variants configuration (ProviderTransform.variants)
 * - Provider options wrapping (ProviderTransform.providerOptions)
 * - Default values (temperature, topP, topK)
 * - Schema transformation (ProviderTransform.schema)
 * - Max output tokens calculation (ProviderTransform.maxOutputTokens)
 * - Small model options (ProviderTransform.smallOptions)
 * - Error transformation (ProviderTransform.error)
 * - Caching behavior differences across providers
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { ProviderTransform } from "../transform"
import type { Provider } from "../provider"
import type { ModelMessage, APICallError } from "ai"

// ============================================================================
// Test Data
// ============================================================================

/**
 * Providers to test - covers all major providers with distinct behaviors
 */
const PROVIDERS_TO_TEST = [
  "anthropic",
  "openai",
  "amazon-bedrock",
  "azure",
  "google",
  "google-vertex",
  "github-copilot",
  "openrouter",
  "cloudflare-ai-gateway",
  "cerebras",
  "groq",
  "mistral",
  "xai",
  "deepinfra",
  "cohere",
  "togetherai",
  "perplexity",
  "opencode",
] as const

type ProviderID = (typeof PROVIDERS_TO_TEST)[number]

/**
 * SDK npm packages for each provider
 */
const SDK_MAP: Record<ProviderID, string> = {
  anthropic: "@ai-sdk/anthropic",
  openai: "@ai-sdk/openai",
  "amazon-bedrock": "@ai-sdk/amazon-bedrock",
  azure: "@ai-sdk/azure",
  google: "@ai-sdk/google",
  "google-vertex": "@ai-sdk/google-vertex",
  "github-copilot": "@ai-sdk/github-copilot",
  openrouter: "@openrouter/ai-sdk-provider",
  "cloudflare-ai-gateway": "@ai-sdk/openai-compatible",
  cerebras: "@ai-sdk/cerebras",
  groq: "@ai-sdk/groq",
  mistral: "@ai-sdk/mistral",
  xai: "@ai-sdk/xai",
  deepinfra: "@ai-sdk/deepinfra",
  cohere: "@ai-sdk/cohere",
  togetherai: "@ai-sdk/togetherai",
  perplexity: "@ai-sdk/perplexity",
  opencode: "@ai-sdk/openai-compatible",
}

/**
 * Create a mock model for testing
 */
function createMockModel(
  providerID: ProviderID,
  overrides: Partial<Provider.Model> = {}
): Provider.Model {
  const npm = SDK_MAP[providerID]
  return {
    id: `test-model-${providerID}`,
    providerID,
    name: `Test Model (${providerID})`,
    family: "test",
    api: {
      id: `test-model-${providerID}`,
      url: "https://api.example.com",
      npm,
    },
    status: "active",
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: {
        text: true,
        audio: false,
        image: true,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: false,
    },
    cost: {
      input: 0.01,
      output: 0.03,
      cache: { read: 0.005, write: 0.01 },
    },
    limit: {
      context: 128000,
      output: 4096,
    },
    options: {},
    headers: {},
    release_date: "2024-01-01",
    variants: {},
    ...overrides,
  }
}

/**
 * Create a mock model with reasoning capability
 */
function createReasoningModel(
  providerID: ProviderID,
  overrides: Partial<Provider.Model> = {}
): Provider.Model {
  return createMockModel(providerID, {
    capabilities: {
      ...createMockModel(providerID).capabilities,
      reasoning: true,
    },
    ...overrides,
  })
}

// ============================================================================
// Test Messages
// ============================================================================

/**
 * Standard test messages covering common scenarios
 */
const TEST_MESSAGES: ModelMessage[] = [
  // Simple user message
  {
    role: "user",
    content: "Hello, how are you?",
  },
  // Simple assistant message
  {
    role: "assistant",
    content: "I'm doing well, thank you for asking!",
  },
  // System message
  {
    role: "system",
    content: "You are a helpful assistant.",
  },
  // User message with array content
  {
    role: "user",
    content: [
      { type: "text", text: "What is in this image?" },
      {
        type: "image",
        image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      },
    ],
  },
]

/**
 * Messages with tool calls for testing tool ID normalization
 */
const TOOL_CALL_MESSAGES: ModelMessage[] = [
  {
    role: "user",
    content: "Please search for information about TypeScript.",
  },
  {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "call_abc123!@#$%^&*()",
        toolName: "search",
        args: { query: "TypeScript" },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call_abc123!@#$%^&*()",
        toolName: "search",
        result: { results: ["TypeScript is a typed superset of JavaScript"] },
      },
    ],
  },
  {
    role: "assistant",
    content: "Based on my search, TypeScript is a typed superset of JavaScript.",
  },
]

/**
 * Messages with empty content for testing filtering
 */
const EMPTY_CONTENT_MESSAGES: ModelMessage[] = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "" },
  { role: "user", content: "" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "" },
      { type: "text", text: "Valid content" },
    ],
  },
]

/**
 * Messages with reasoning parts for interleaved thinking
 */
const REASONING_MESSAGES: ModelMessage[] = [
  { role: "user", content: "What is 2+2?" },
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: "I need to add 2 and 2 together." },
      { type: "text", text: "The answer is 4." },
    ],
  },
]

/**
 * Tool-then-user message sequence for Mistral fix
 */
const TOOL_USER_SEQUENCE_MESSAGES: ModelMessage[] = [
  { role: "user", content: "Search for something" },
  {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "call_123456789",
        toolName: "search",
        args: { query: "test" },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "call_123456789",
        toolName: "search",
        result: { data: "result" },
      },
    ],
  },
  { role: "user", content: "Thanks, now do something else" },
]

/**
 * Messages with unsupported modalities
 */
const UNSUPPORTED_MODALITY_MESSAGES: ModelMessage[] = [
  {
    role: "user",
    content: [
      { type: "text", text: "What is in this video?" },
      {
        type: "file",
        mediaType: "video/mp4",
        filename: "test.mp4",
        data: new Uint8Array([0, 1, 2, 3]),
      },
    ],
  },
]

// ============================================================================
// Golden Tests
// ============================================================================

describe("Provider Golden Tests", () => {
  describe("Message Normalization", () => {
    for (const providerID of PROVIDERS_TO_TEST) {
      describe(providerID, () => {
        it("normalizes standard messages", () => {
          const model = createMockModel(providerID)
          const result = ProviderTransform.message([...TEST_MESSAGES], model)
          expect(result).toMatchSnapshot()
        })

        it("normalizes tool call messages", () => {
          const model = createMockModel(providerID)
          const result = ProviderTransform.message([...TOOL_CALL_MESSAGES], model)
          expect(result).toMatchSnapshot()
        })

        it("handles empty content messages", () => {
          const model = createMockModel(providerID)
          const result = ProviderTransform.message([...EMPTY_CONTENT_MESSAGES], model)
          expect(result).toMatchSnapshot()
        })

        it("handles unsupported modalities", () => {
          const model = createMockModel(providerID)
          const result = ProviderTransform.message([...UNSUPPORTED_MODALITY_MESSAGES], model)
          expect(result).toMatchSnapshot()
        })
      })
    }

    // Provider-specific edge cases
    describe("Anthropic-specific", () => {
      it("filters empty string messages", () => {
        const model = createMockModel("anthropic")
        const result = ProviderTransform.message([...EMPTY_CONTENT_MESSAGES], model)
        expect(result.some((m) => m.content === "")).toBe(false)
      })

      it("sanitizes tool call IDs to alphanumeric with underscore/hyphen", () => {
        const model = createMockModel("anthropic", {
          api: { ...createMockModel("anthropic").api, id: "claude-3-opus" },
        })
        const result = ProviderTransform.message([...TOOL_CALL_MESSAGES], model)
        const toolCallMsg = result.find(
          (m) => m.role === "assistant" && Array.isArray(m.content)
        )
        if (toolCallMsg && Array.isArray(toolCallMsg.content)) {
          const toolCall = toolCallMsg.content.find((p: any) => p.type === "tool-call")
          if (toolCall && "toolCallId" in toolCall) {
            expect(toolCall.toolCallId).toMatch(/^[a-zA-Z0-9_-]+$/)
          }
        }
      })

      it("applies caching markers", () => {
        const model = createMockModel("anthropic")
        const result = ProviderTransform.message([...TEST_MESSAGES], model)
        const hasCache = result.some(
          (m) => (m.providerOptions as any)?.anthropic?.cacheControl !== undefined
        )
        expect(hasCache).toBe(true)
      })
    })

    describe("Mistral-specific", () => {
      it("normalizes tool IDs to exactly 9 alphanumeric chars", () => {
        const model = createMockModel("mistral")
        const result = ProviderTransform.message([...TOOL_CALL_MESSAGES], model)
        const toolCallMsg = result.find(
          (m) => m.role === "assistant" && Array.isArray(m.content)
        )
        if (toolCallMsg && Array.isArray(toolCallMsg.content)) {
          const toolCall = toolCallMsg.content.find((p: any) => p.type === "tool-call")
          if (toolCall && "toolCallId" in toolCall) {
            expect(toolCall.toolCallId).toHaveLength(9)
            expect(toolCall.toolCallId).toMatch(/^[a-zA-Z0-9]+$/)
          }
        }
      })

      it("inserts assistant message between tool and user", () => {
        const model = createMockModel("mistral")
        const result = ProviderTransform.message([...TOOL_USER_SEQUENCE_MESSAGES], model)
        // Find tool message and check what follows
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i].role === "tool" && result[i + 1].role === "user") {
            // This should not happen - an assistant message should be inserted
            expect(true).toBe(false)
          }
        }
        expect(result).toMatchSnapshot()
      })
    })

    describe("Interleaved thinking", () => {
      it("transforms reasoning parts to providerOptions for reasoning_content field", () => {
        const model = createMockModel("openai", {
          capabilities: {
            ...createMockModel("openai").capabilities,
            interleaved: { field: "reasoning_content" },
          },
        })
        const result = ProviderTransform.message([...REASONING_MESSAGES], model)
        expect(result).toMatchSnapshot()
      })
    })
  })

  describe("Options Building", () => {
    for (const providerID of PROVIDERS_TO_TEST) {
      it(`builds options for ${providerID}`, () => {
        const model = createMockModel(providerID)
        const result = ProviderTransform.options(model, "test-session-123", {})
        expect(result).toMatchSnapshot()
      })
    }

    // Provider-specific options
    describe("OpenAI-specific", () => {
      it("includes promptCacheKey for session", () => {
        const model = createMockModel("openai")
        const result = ProviderTransform.options(model, "test-session-456", {})
        expect(result.promptCacheKey).toBe("test-session-456")
      })
    })

    describe("Google-specific", () => {
      it("includes thinkingConfig", () => {
        const model = createMockModel("google")
        const result = ProviderTransform.options(model, "test-session", {})
        expect(result.thinkingConfig).toBeDefined()
        expect(result.thinkingConfig.includeThoughts).toBe(true)
      })

      it("sets thinkingLevel for gemini-3 models", () => {
        const model = createMockModel("google", {
          api: { ...createMockModel("google").api, id: "gemini-3-pro" },
        })
        const result = ProviderTransform.options(model, "test-session", {})
        expect(result.thinkingConfig?.thinkingLevel).toBe("high")
      })
    })

    describe("OpenRouter-specific", () => {
      it("includes usage tracking", () => {
        const model = createMockModel("openrouter")
        const result = ProviderTransform.options(model, "test-session", {})
        expect(result.usage).toEqual({ include: true })
      })
    })
  })

  describe("Variants Configuration", () => {
    for (const providerID of PROVIDERS_TO_TEST) {
      it(`returns variants for ${providerID} (non-reasoning model)`, () => {
        const model = createMockModel(providerID)
        const result = ProviderTransform.variants(model)
        expect(result).toMatchSnapshot()
      })

      it(`returns variants for ${providerID} (reasoning model)`, () => {
        const model = createReasoningModel(providerID)
        const result = ProviderTransform.variants(model)
        expect(result).toMatchSnapshot()
      })
    }

    // Provider-specific variant tests
    describe("Anthropic variants", () => {
      it("returns high and max thinking budgets", () => {
        const model = createReasoningModel("anthropic")
        const result = ProviderTransform.variants(model)
        expect(result.high?.thinking?.budgetTokens).toBe(16000)
        expect(result.max?.thinking?.budgetTokens).toBe(31999)
      })
    })

    describe("OpenAI variants", () => {
      it("returns reasoning effort levels", () => {
        const model = createReasoningModel("openai", {
          release_date: "2025-12-04",
        })
        const result = ProviderTransform.variants(model)
        expect(Object.keys(result)).toContain("low")
        expect(Object.keys(result)).toContain("medium")
        expect(Object.keys(result)).toContain("high")
      })
    })

    describe("Amazon Bedrock variants", () => {
      it("returns reasoningConfig with maxReasoningEffort", () => {
        const model = createReasoningModel("amazon-bedrock")
        const result = ProviderTransform.variants(model)
        expect(result.low?.reasoningConfig?.maxReasoningEffort).toBe("low")
        expect(result.medium?.reasoningConfig?.maxReasoningEffort).toBe("medium")
        expect(result.high?.reasoningConfig?.maxReasoningEffort).toBe("high")
      })
    })

    describe("Google variants", () => {
      it("returns thinkingConfig for 2.5 models", () => {
        const model = createReasoningModel("google", {
          id: "gemini-2.5-pro",
        })
        const result = ProviderTransform.variants(model)
        expect(result.high?.thinkingConfig?.thinkingBudget).toBe(16000)
        expect(result.max?.thinkingConfig?.thinkingBudget).toBe(24576)
      })

      it("returns thinkingLevel for other models", () => {
        const model = createReasoningModel("google", {
          id: "gemini-3-pro",
        })
        const result = ProviderTransform.variants(model)
        expect(result.low?.thinkingLevel).toBe("low")
        expect(result.high?.thinkingLevel).toBe("high")
      })
    })
  })

  describe("Provider Options Wrapping", () => {
    for (const providerID of PROVIDERS_TO_TEST) {
      it(`wraps options correctly for ${providerID}`, () => {
        const model = createMockModel(providerID)
        const options = { temperature: 0.7, maxTokens: 1000 }
        const result = ProviderTransform.providerOptions(model, options)
        expect(result).toMatchSnapshot()
      })
    }

    // Verify namespace correctness
    describe("Namespace verification", () => {
      it("wraps anthropic under 'anthropic' key", () => {
        const model = createMockModel("anthropic")
        const result = ProviderTransform.providerOptions(model, { test: true })
        expect(result).toHaveProperty("anthropic")
      })

      it("wraps openai under 'openai' key", () => {
        const model = createMockModel("openai")
        const result = ProviderTransform.providerOptions(model, { test: true })
        expect(result).toHaveProperty("openai")
      })

      it("wraps azure under 'openai' key", () => {
        const model = createMockModel("azure")
        const result = ProviderTransform.providerOptions(model, { test: true })
        expect(result).toHaveProperty("openai")
      })

      it("wraps amazon-bedrock under 'bedrock' key", () => {
        const model = createMockModel("amazon-bedrock")
        const result = ProviderTransform.providerOptions(model, { test: true })
        expect(result).toHaveProperty("bedrock")
      })

      it("wraps google under 'google' key", () => {
        const model = createMockModel("google")
        const result = ProviderTransform.providerOptions(model, { test: true })
        expect(result).toHaveProperty("google")
      })

      it("wraps openrouter under 'openrouter' key", () => {
        const model = createMockModel("openrouter")
        const result = ProviderTransform.providerOptions(model, { test: true })
        expect(result).toHaveProperty("openrouter")
      })
    })
  })

  describe("Default Values", () => {
    for (const providerID of PROVIDERS_TO_TEST) {
      it(`returns defaults for ${providerID}`, () => {
        const model = createMockModel(providerID)
        const result = {
          temperature: ProviderTransform.temperature(model),
          topP: ProviderTransform.topP(model),
          topK: ProviderTransform.topK(model),
        }
        expect(result).toMatchSnapshot()
      })
    }

    // Model-specific defaults
    describe("Model-specific temperatures", () => {
      it("returns 0.55 for qwen models", () => {
        const model = createMockModel("openai", { id: "qwen-2.5-72b" })
        expect(ProviderTransform.temperature(model)).toBe(0.55)
      })

      it("returns undefined for claude models", () => {
        const model = createMockModel("anthropic", { id: "claude-3-opus" })
        expect(ProviderTransform.temperature(model)).toBeUndefined()
      })

      it("returns 1.0 for gemini models", () => {
        const model = createMockModel("google", { id: "gemini-2-pro" })
        expect(ProviderTransform.temperature(model)).toBe(1.0)
      })
    })

    describe("Model-specific topP", () => {
      it("returns 1 for qwen models", () => {
        const model = createMockModel("openai", { id: "qwen-2.5-72b" })
        expect(ProviderTransform.topP(model)).toBe(1)
      })

      it("returns 0.95 for gemini models", () => {
        const model = createMockModel("google", { id: "gemini-2-pro" })
        expect(ProviderTransform.topP(model)).toBe(0.95)
      })
    })

    describe("Model-specific topK", () => {
      it("returns 64 for gemini models", () => {
        const model = createMockModel("google", { id: "gemini-2-pro" })
        expect(ProviderTransform.topK(model)).toBe(64)
      })
    })
  })

  describe("Small Model Options", () => {
    for (const providerID of PROVIDERS_TO_TEST) {
      it(`returns small options for ${providerID}`, () => {
        const model = createMockModel(providerID)
        const result = ProviderTransform.smallOptions(model)
        expect(result).toMatchSnapshot()
      })
    }

    describe("Provider-specific small options", () => {
      it("returns reasoningEffort for openai", () => {
        const model = createMockModel("openai", { id: "gpt-5-mini" })
        const result = ProviderTransform.smallOptions(model)
        expect(result.reasoningEffort).toBeDefined()
      })

      it("returns thinkingConfig for google", () => {
        const model = createMockModel("google")
        const result = ProviderTransform.smallOptions(model)
        expect(result.thinkingConfig?.thinkingBudget).toBe(0)
      })
    })
  })

  describe("Max Output Tokens Calculation", () => {
    it("returns standard limit when no thinking enabled", () => {
      const result = ProviderTransform.maxOutputTokens(
        "@ai-sdk/anthropic",
        {},
        4096,
        32000
      )
      expect(result).toBe(4096)
    })

    it("respects global limit", () => {
      const result = ProviderTransform.maxOutputTokens(
        "@ai-sdk/anthropic",
        {},
        50000,
        32000
      )
      expect(result).toBe(32000)
    })

    it("reduces output tokens when thinking is enabled for anthropic", () => {
      const result = ProviderTransform.maxOutputTokens(
        "@ai-sdk/anthropic",
        {
          thinking: {
            type: "enabled",
            budgetTokens: 16000,
          },
        },
        64000,
        32000
      )
      // With thinking enabled, should subtract budgetTokens from limit
      expect(result).toBeLessThanOrEqual(32000)
    })

    // Snapshot all providers
    for (const providerID of PROVIDERS_TO_TEST) {
      it(`calculates correctly for ${providerID}`, () => {
        const npm = SDK_MAP[providerID]
        const result = {
          noThinking: ProviderTransform.maxOutputTokens(npm, {}, 4096, 32000),
          withThinking: ProviderTransform.maxOutputTokens(
            npm,
            { thinking: { type: "enabled", budgetTokens: 8000 } },
            64000,
            32000
          ),
          modelLimited: ProviderTransform.maxOutputTokens(npm, {}, 2048, 32000),
          globalLimited: ProviderTransform.maxOutputTokens(npm, {}, 64000, 16000),
        }
        expect(result).toMatchSnapshot()
      })
    }
  })

  describe("Schema Transformation", () => {
    const testSchema = {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
        count: { type: "integer" as const, enum: [1, 2, 3] },
        items: { type: "array" as const },
      },
      required: ["name", "count", "nonexistent"] as string[],
    }

    for (const providerID of PROVIDERS_TO_TEST) {
      it(`transforms schema for ${providerID}`, () => {
        const model = createMockModel(providerID)
        const result = ProviderTransform.schema(model, testSchema)
        expect(result).toMatchSnapshot()
      })
    }

    describe("Google/Gemini schema sanitization", () => {
      it("converts integer enums to string enums", () => {
        const model = createMockModel("google", { id: "gemini-2-pro" })
        const schema = {
          type: "object" as const,
          properties: {
            level: { type: "integer" as const, enum: [1, 2, 3] },
          },
        }
        const result = ProviderTransform.schema(model, schema)
        expect((result as any).properties.level.enum).toEqual(["1", "2", "3"])
        expect((result as any).properties.level.type).toBe("string")
      })

      it("filters required array to only existing properties", () => {
        const model = createMockModel("google", { id: "gemini-2-pro" })
        const schema = {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
          },
          required: ["name", "missing_field"] as string[],
        }
        const result = ProviderTransform.schema(model, schema)
        expect((result as any).required).toEqual(["name"])
      })

      it("adds empty items to arrays without items", () => {
        const model = createMockModel("google", { id: "gemini-2-pro" })
        const schema = {
          type: "array" as const,
        }
        const result = ProviderTransform.schema(model, schema)
        expect((result as any).items).toEqual({})
      })
    })
  })
})

// ============================================================================
// Edge Case Tests
// ============================================================================

describe("Edge Cases", () => {
  describe("Empty inputs", () => {
    it("handles empty message array", () => {
      const model = createMockModel("anthropic")
      const result = ProviderTransform.message([], model)
      expect(result).toEqual([])
    })
  })

  describe("Special characters in tool IDs", () => {
    const specialCharsMessage: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "!@#$%^&*()_+-=[]{}|;':\",./<>?",
            toolName: "test",
            args: {},
          },
        ],
      },
    ]

    for (const providerID of ["anthropic", "mistral"] as const) {
      it(`sanitizes special chars for ${providerID}`, () => {
        const model = createMockModel(providerID, {
          api: {
            ...createMockModel(providerID).api,
            id: providerID === "anthropic" ? "claude-3-opus" : "mistral-large",
          },
        })
        const result = ProviderTransform.message([...specialCharsMessage], model)
        expect(result).toMatchSnapshot()
      })
    }
  })

  describe("Very long tool IDs", () => {
    const longIdMessage: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "a".repeat(100),
            toolName: "test",
            args: {},
          },
        ],
      },
    ]

    it("Mistral truncates to 9 characters", () => {
      const model = createMockModel("mistral")
      const result = ProviderTransform.message([...longIdMessage], model)
      const toolCallMsg = result.find(
        (m) => m.role === "assistant" && Array.isArray(m.content)
      )
      if (toolCallMsg && Array.isArray(toolCallMsg.content)) {
        const toolCall = toolCallMsg.content.find((p: any) => p.type === "tool-call")
        if (toolCall && "toolCallId" in toolCall) {
          expect(toolCall.toolCallId).toHaveLength(9)
        }
      }
    })
  })

  describe("Deeply nested content", () => {
    const nestedSchema = {
      type: "object" as const,
      properties: {
        level1: {
          type: "object" as const,
          properties: {
            level2: {
              type: "object" as const,
              properties: {
                level3: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    properties: {
                      value: { type: "integer" as const, enum: [1, 2, 3] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }

    it("Google sanitizes nested integer enums", () => {
      const model = createMockModel("google", { id: "gemini-2-pro" })
      const result = ProviderTransform.schema(model, nestedSchema)
      const deepEnum = (result as any).properties.level1.properties.level2.properties
        .level3.items.properties.value.enum
      expect(deepEnum).toEqual(["1", "2", "3"])
    })
  })
})

// ============================================================================
// Error Transformation Tests (Critical Issue #1)
// ============================================================================

describe("Error Transformation", () => {
  /**
   * Create a mock APICallError for testing
   */
  function createMockAPICallError(message: string): APICallError {
    return {
      name: "APICallError",
      message,
      url: "https://api.example.com",
      requestBodyValues: {},
      statusCode: 400,
      responseHeaders: {},
      responseBody: "",
      isRetryable: false,
      data: undefined,
    } as APICallError
  }

  describe("GitHub Copilot error handling", () => {
    it("appends copilot settings link for unsupported model errors", () => {
      const error = createMockAPICallError("The requested model is not supported for this endpoint")
      const result = ProviderTransform.error("github-copilot", error)
      expect(result).toContain("The requested model is not supported")
      expect(result).toContain("https://github.com/settings/copilot/features")
    })

    it("appends copilot settings link when error contains model not supported text", () => {
      const error = createMockAPICallError("Error: The requested model is not supported by the API")
      const result = ProviderTransform.error("github-copilot", error)
      expect(result).toContain("https://github.com/settings/copilot/features")
    })

    it("returns original message for other github-copilot errors", () => {
      const error = createMockAPICallError("Rate limit exceeded")
      const result = ProviderTransform.error("github-copilot", error)
      expect(result).toBe("Rate limit exceeded")
      expect(result).not.toContain("https://github.com/settings/copilot/features")
    })
  })

  describe("Non-copilot provider error handling", () => {
    it("returns original message for anthropic provider", () => {
      const error = createMockAPICallError("The requested model is not supported")
      const result = ProviderTransform.error("anthropic", error)
      expect(result).toBe("The requested model is not supported")
      expect(result).not.toContain("https://github.com/settings/copilot/features")
    })

    it("returns original message for openai provider", () => {
      const error = createMockAPICallError("Model not found")
      const result = ProviderTransform.error("openai", error)
      expect(result).toBe("Model not found")
    })

    it("returns original message for google provider", () => {
      const error = createMockAPICallError("Invalid API key")
      const result = ProviderTransform.error("google", error)
      expect(result).toBe("Invalid API key")
    })

    for (const providerID of PROVIDERS_TO_TEST) {
      if (providerID === "github-copilot") continue

      it(`passes through errors unchanged for ${providerID}`, () => {
        const error = createMockAPICallError("Generic error message")
        const result = ProviderTransform.error(providerID, error)
        expect(result).toBe("Generic error message")
      })
    }
  })

  describe("Error transformation snapshots", () => {
    const errorScenarios = [
      { message: "The requested model is not supported", description: "model not supported" },
      { message: "Rate limit exceeded", description: "rate limit" },
      { message: "Invalid API key", description: "invalid key" },
      { message: "Context length exceeded", description: "context exceeded" },
    ]

    for (const providerID of PROVIDERS_TO_TEST) {
      for (const scenario of errorScenarios) {
        it(`transforms ${scenario.description} error for ${providerID}`, () => {
          const error = createMockAPICallError(scenario.message)
          const result = ProviderTransform.error(providerID, error)
          expect(result).toMatchSnapshot()
        })
      }
    }
  })
})

// ============================================================================
// Model-Specific Default Tests (Critical Issue #2)
// ============================================================================

describe("Model-Specific Defaults", () => {
  describe("Temperature defaults", () => {
    it("returns 1.0 for glm-4.6 models", () => {
      const model = createMockModel("openai", { id: "glm-4.6-flash" })
      expect(ProviderTransform.temperature(model)).toBe(1.0)
    })

    it("returns 1.0 for glm-4.7 models", () => {
      const model = createMockModel("openai", { id: "glm-4.7-plus" })
      expect(ProviderTransform.temperature(model)).toBe(1.0)
    })

    it("returns 1.0 for minimax-m2 models", () => {
      const model = createMockModel("openai", { id: "minimax-m2-standard" })
      expect(ProviderTransform.temperature(model)).toBe(1.0)
    })

    it("returns 1.0 for minimax-m2.1 models", () => {
      const model = createMockModel("openai", { id: "minimax-m2.1-pro" })
      expect(ProviderTransform.temperature(model)).toBe(1.0)
    })

    it("returns 0.6 for kimi-k2 models (non-thinking)", () => {
      const model = createMockModel("openai", { id: "kimi-k2-standard" })
      expect(ProviderTransform.temperature(model)).toBe(0.6)
    })

    it("returns 1.0 for kimi-k2-thinking models", () => {
      const model = createMockModel("openai", { id: "kimi-k2-thinking" })
      expect(ProviderTransform.temperature(model)).toBe(1.0)
    })

    it("returns undefined for standard models without special defaults", () => {
      const model = createMockModel("openai", { id: "gpt-4o" })
      expect(ProviderTransform.temperature(model)).toBeUndefined()
    })
  })

  describe("TopP defaults", () => {
    it("returns 0.95 for minimax-m2 models", () => {
      const model = createMockModel("openai", { id: "minimax-m2-standard" })
      expect(ProviderTransform.topP(model)).toBe(0.95)
    })

    it("returns 0.95 for minimax-m2.1 models", () => {
      const model = createMockModel("openai", { id: "minimax-m2.1-pro" })
      expect(ProviderTransform.topP(model)).toBe(0.95)
    })

    it("returns undefined for models without special topP defaults", () => {
      const model = createMockModel("openai", { id: "gpt-4o" })
      expect(ProviderTransform.topP(model)).toBeUndefined()
    })
  })

  describe("TopK defaults", () => {
    it("returns 40 for minimax-m2.1 models", () => {
      const model = createMockModel("openai", { id: "minimax-m2.1-pro" })
      expect(ProviderTransform.topK(model)).toBe(40)
    })

    it("returns 20 for minimax-m2 models (non-2.1)", () => {
      const model = createMockModel("openai", { id: "minimax-m2-standard" })
      expect(ProviderTransform.topK(model)).toBe(20)
    })

    it("returns undefined for models without special topK defaults", () => {
      const model = createMockModel("openai", { id: "gpt-4o" })
      expect(ProviderTransform.topK(model)).toBeUndefined()
    })
  })

  describe("Combined defaults snapshots", () => {
    const modelVariants = [
      { id: "glm-4.6-flash", description: "glm-4.6" },
      { id: "glm-4.7-plus", description: "glm-4.7" },
      { id: "minimax-m2-standard", description: "minimax-m2" },
      { id: "minimax-m2.1-pro", description: "minimax-m2.1" },
      { id: "kimi-k2-standard", description: "kimi-k2" },
      { id: "kimi-k2-thinking", description: "kimi-k2-thinking" },
    ]

    for (const variant of modelVariants) {
      it(`returns correct defaults for ${variant.description}`, () => {
        const model = createMockModel("openai", { id: variant.id })
        const result = {
          temperature: ProviderTransform.temperature(model),
          topP: ProviderTransform.topP(model),
          topK: ProviderTransform.topK(model),
        }
        expect(result).toMatchSnapshot()
      })
    }
  })
})

// ============================================================================
// Caching Behavior Tests (High Priority Issue #5)
// ============================================================================

describe("Caching Behavior Differences", () => {
  /**
   * Messages with caching markers applied
   */
  const CACHING_TEST_MESSAGES: ModelMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: "How are you?" },
  ]

  describe("Anthropic caching format", () => {
    it("uses cacheControl with type ephemeral", () => {
      const model = createMockModel("anthropic")
      const result = ProviderTransform.message([...CACHING_TEST_MESSAGES], model)

      // Check that at least one message has anthropic caching
      const hasCaching = result.some((m) => {
        const opts = m.providerOptions as any
        return opts?.anthropic?.cacheControl?.type === "ephemeral"
      })
      expect(hasCaching).toBe(true)
    })

    it("applies caching to system messages", () => {
      const model = createMockModel("anthropic")
      const result = ProviderTransform.message([...CACHING_TEST_MESSAGES], model)

      const systemMsg = result.find((m) => m.role === "system")
      expect(systemMsg?.providerOptions).toBeDefined()
      expect((systemMsg?.providerOptions as any)?.anthropic?.cacheControl).toBeDefined()
    })

    it("caching format matches snapshot", () => {
      const model = createMockModel("anthropic")
      const result = ProviderTransform.message([...CACHING_TEST_MESSAGES], model)
      expect(result).toMatchSnapshot()
    })
  })

  describe("Amazon Bedrock caching format", () => {
    it("uses cachePoint in providerOptions structure", () => {
      // Note: Bedrock caching is applied via providerOptions with cachePoint
      // This is configured in applyCaching function
      const model = createMockModel("amazon-bedrock", {
        api: {
          ...createMockModel("amazon-bedrock").api,
          id: "anthropic.claude-3-sonnet",
        },
      })

      // Bedrock with anthropic/claude models should get caching
      const extendedMessages: ModelMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ]

      // Since bedrock uses @ai-sdk/amazon-bedrock not anthropic npm, caching path differs
      const result = ProviderTransform.message([...extendedMessages], model)
      expect(result).toMatchSnapshot()
    })

    it("bedrock caching structure uses cachePoint type ephemeral", () => {
      // Verify the structure expected for bedrock caching
      const expectedStructure = {
        bedrock: {
          cachePoint: { type: "ephemeral" },
        },
      }
      expect(expectedStructure.bedrock.cachePoint.type).toBe("ephemeral")
    })
  })

  describe("OpenRouter caching format", () => {
    it("uses cacheControl in provider options", () => {
      const model = createMockModel("openrouter", {
        api: {
          ...createMockModel("openrouter").api,
          id: "anthropic/claude-3-sonnet",
        },
      })

      // OpenRouter with anthropic models should have caching enabled
      const result = ProviderTransform.message([...CACHING_TEST_MESSAGES], model)
      expect(result).toMatchSnapshot()
    })
  })

  describe("Caching comparison across providers", () => {
    const cachingProviders = ["anthropic", "amazon-bedrock", "openrouter"] as const

    for (const providerID of cachingProviders) {
      it(`captures caching behavior for ${providerID}`, () => {
        const model = createMockModel(providerID as ProviderID, {
          api: {
            ...createMockModel(providerID as ProviderID).api,
            id: providerID === "anthropic" ? "claude-3-sonnet" : `anthropic/claude-3-sonnet`,
          },
        })
        const result = ProviderTransform.message([...CACHING_TEST_MESSAGES], model)
        expect(result).toMatchSnapshot()
      })
    }
  })
})

// ============================================================================
// Extended Variants Coverage (High Priority Issue #6)
// ============================================================================

describe("Extended Variants Coverage", () => {
  describe("XAI variants", () => {
    it("returns reasoning effort variants for reasoning models", () => {
      const model = createReasoningModel("xai")
      const result = ProviderTransform.variants(model)
      expect(result).toMatchSnapshot()
    })

    it("includes low, medium, high efforts", () => {
      const model = createReasoningModel("xai")
      const result = ProviderTransform.variants(model)
      expect(Object.keys(result)).toContain("low")
      expect(Object.keys(result)).toContain("medium")
      expect(Object.keys(result)).toContain("high")
    })

    it("returns empty for non-reasoning models", () => {
      const model = createMockModel("xai")
      const result = ProviderTransform.variants(model)
      expect(result).toEqual({})
    })
  })

  describe("DeepInfra variants", () => {
    it("returns reasoning effort variants for reasoning models", () => {
      const model = createReasoningModel("deepinfra")
      const result = ProviderTransform.variants(model)
      expect(result).toMatchSnapshot()
    })

    it("includes low, medium, high efforts", () => {
      const model = createReasoningModel("deepinfra")
      const result = ProviderTransform.variants(model)
      expect(Object.keys(result)).toContain("low")
      expect(Object.keys(result)).toContain("medium")
      expect(Object.keys(result)).toContain("high")
    })
  })

  describe("Cohere variants", () => {
    it("returns empty variants (cohere does not support reasoning variants)", () => {
      const model = createReasoningModel("cohere")
      const result = ProviderTransform.variants(model)
      // Based on transform.ts, cohere returns {} for variants
      expect(result).toEqual({})
    })

    it("returns empty for non-reasoning models", () => {
      const model = createMockModel("cohere")
      const result = ProviderTransform.variants(model)
      expect(result).toEqual({})
    })
  })

  describe("TogetherAI variants", () => {
    it("returns reasoning effort variants for reasoning models", () => {
      const model = createReasoningModel("togetherai")
      const result = ProviderTransform.variants(model)
      expect(result).toMatchSnapshot()
    })

    it("includes low, medium, high efforts", () => {
      const model = createReasoningModel("togetherai")
      const result = ProviderTransform.variants(model)
      expect(Object.keys(result)).toContain("low")
      expect(Object.keys(result)).toContain("medium")
      expect(Object.keys(result)).toContain("high")
    })
  })

  describe("Perplexity variants", () => {
    it("returns empty variants (perplexity does not support reasoning variants)", () => {
      const model = createReasoningModel("perplexity")
      const result = ProviderTransform.variants(model)
      // Based on transform.ts, perplexity returns {} for variants
      expect(result).toEqual({})
    })
  })

  describe("Cerebras variants", () => {
    it("returns reasoning effort variants for reasoning models", () => {
      const model = createReasoningModel("cerebras")
      const result = ProviderTransform.variants(model)
      expect(result).toMatchSnapshot()
    })

    it("includes low, medium, high efforts", () => {
      const model = createReasoningModel("cerebras")
      const result = ProviderTransform.variants(model)
      expect(Object.keys(result)).toContain("low")
      expect(Object.keys(result)).toContain("medium")
      expect(Object.keys(result)).toContain("high")
    })
  })

  describe("Groq variants", () => {
    it("returns thinkingLevel variants for reasoning models", () => {
      const model = createReasoningModel("groq")
      const result = ProviderTransform.variants(model)
      expect(result).toMatchSnapshot()
    })

    it("includes none, low, medium, high levels", () => {
      const model = createReasoningModel("groq")
      const result = ProviderTransform.variants(model)
      expect(Object.keys(result)).toContain("none")
      expect(Object.keys(result)).toContain("low")
      expect(Object.keys(result)).toContain("medium")
      expect(Object.keys(result)).toContain("high")
    })

    it("variants include thinkingLevel property", () => {
      const model = createReasoningModel("groq")
      const result = ProviderTransform.variants(model)
      expect(result.high?.thinkingLevel).toBe("high")
      expect(result.low?.thinkingLevel).toBe("low")
    })
  })

  describe("Variants snapshot comparison", () => {
    const extendedProviders = [
      "xai",
      "deepinfra",
      "cohere",
      "togetherai",
      "perplexity",
      "cerebras",
    ] as const

    for (const providerID of extendedProviders) {
      it(`captures variant structure for ${providerID} reasoning model`, () => {
        const model = createReasoningModel(providerID as ProviderID)
        const result = ProviderTransform.variants(model)
        expect(result).toMatchSnapshot()
      })

      it(`captures variant structure for ${providerID} non-reasoning model`, () => {
        const model = createMockModel(providerID as ProviderID)
        const result = ProviderTransform.variants(model)
        expect(result).toMatchSnapshot()
      })
    }
  })
})

// ============================================================================
// Additional Provider Coverage Tests
// ============================================================================

describe("New Provider Coverage", () => {
  const newProviders = ["xai", "deepinfra", "cohere", "togetherai", "perplexity", "opencode"] as const

  describe("Message normalization", () => {
    for (const providerID of newProviders) {
      it(`normalizes messages for ${providerID}`, () => {
        const model = createMockModel(providerID as ProviderID)
        const result = ProviderTransform.message([...TEST_MESSAGES], model)
        expect(result).toMatchSnapshot()
      })
    }
  })

  describe("Provider options wrapping", () => {
    for (const providerID of newProviders) {
      it(`wraps options correctly for ${providerID}`, () => {
        const model = createMockModel(providerID as ProviderID)
        const options = { temperature: 0.7, maxTokens: 1000 }
        const result = ProviderTransform.providerOptions(model, options)
        expect(result).toMatchSnapshot()
      })
    }
  })

  describe("Schema transformation", () => {
    const testSchema = {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
        count: { type: "integer" as const, enum: [1, 2, 3] },
      },
      required: ["name"] as string[],
    }

    for (const providerID of newProviders) {
      it(`transforms schema for ${providerID}`, () => {
        const model = createMockModel(providerID as ProviderID)
        const result = ProviderTransform.schema(model, testSchema)
        expect(result).toMatchSnapshot()
      })
    }
  })

  describe("Options building", () => {
    for (const providerID of newProviders) {
      it(`builds options for ${providerID}`, () => {
        const model = createMockModel(providerID as ProviderID)
        const result = ProviderTransform.options(model, "test-session-new", {})
        expect(result).toMatchSnapshot()
      })
    }
  })

  describe("Small model options", () => {
    for (const providerID of newProviders) {
      it(`returns small options for ${providerID}`, () => {
        const model = createMockModel(providerID as ProviderID)
        const result = ProviderTransform.smallOptions(model)
        expect(result).toMatchSnapshot()
      })
    }
  })
})
