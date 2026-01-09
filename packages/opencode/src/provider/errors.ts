/**
 * Provider Error Classes
 *
 * Custom error types for provider operations with improved error messages
 * and type-safe error handling via static isInstance() methods.
 *
 * @module provider/errors
 */

/**
 * Error thrown when a requested model cannot be found.
 * Includes optional suggestions for similar model names.
 */
export class ModelNotFoundError extends Error {
  constructor(
    public readonly providerID: string,
    public readonly modelID: string,
    public readonly suggestions?: string[]
  ) {
    const suggestionText = suggestions?.length
      ? `\nDid you mean: ${suggestions.join(", ")}?`
      : ""
    super(`Model '${modelID}' not found for provider '${providerID}'${suggestionText}`)
    this.name = "ModelNotFoundError"
  }

  /**
   * Type guard to check if an error is a ModelNotFoundError.
   *
   * @param error - The error to check
   * @returns true if the error is a ModelNotFoundError
   */
  static isInstance(error: unknown): error is ModelNotFoundError {
    return error instanceof ModelNotFoundError
  }
}

/**
 * Error thrown when a provider fails to initialize.
 * May include an underlying cause error.
 */
export class ProviderInitError extends Error {
  public readonly providerID: string
  public readonly reason: string
  public override readonly cause?: Error

  constructor(
    providerID: string,
    reason: string,
    cause?: Error
  ) {
    super(`Failed to initialize provider '${providerID}': ${reason}`)
    this.name = "ProviderInitError"
    this.providerID = providerID
    this.reason = reason
    if (cause) this.cause = cause
  }

  /**
   * Type guard to check if an error is a ProviderInitError.
   *
   * @param error - The error to check
   * @returns true if the error is a ProviderInitError
   */
  static isInstance(error: unknown): error is ProviderInitError {
    return error instanceof ProviderInitError
  }
}

/**
 * Error thrown when authentication fails for a provider.
 * Includes the authentication method that was attempted.
 */
export class AuthenticationError extends Error {
  constructor(
    public readonly providerID: string,
    public readonly method: string,
    public readonly reason: string
  ) {
    super(`Authentication failed for '${providerID}' using ${method}: ${reason}`)
    this.name = "AuthenticationError"
  }

  /**
   * Type guard to check if an error is an AuthenticationError.
   *
   * @param error - The error to check
   * @returns true if the error is an AuthenticationError
   */
  static isInstance(error: unknown): error is AuthenticationError {
    return error instanceof AuthenticationError
  }
}

/**
 * Error thrown when a requested capability is not supported by a provider.
 * May include alternative providers that support the capability.
 */
export class CapabilityNotSupportedError extends Error {
  constructor(
    public readonly providerID: string,
    public readonly capability: string,
    public readonly alternatives?: string[]
  ) {
    const altText = alternatives?.length
      ? `\nProviders with this capability: ${alternatives.join(", ")}`
      : ""
    super(`Provider '${providerID}' does not support '${capability}'${altText}`)
    this.name = "CapabilityNotSupportedError"
  }

  /**
   * Type guard to check if an error is a CapabilityNotSupportedError.
   *
   * @param error - The error to check
   * @returns true if the error is a CapabilityNotSupportedError
   */
  static isInstance(error: unknown): error is CapabilityNotSupportedError {
    return error instanceof CapabilityNotSupportedError
  }
}
