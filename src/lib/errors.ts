export interface BaseErrorOptions {
  code: string;
  message: string;
  details?: unknown;
  cause?: Error;
  context?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    traceId?: string;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    version?: string;
  };
}

export interface WebSocketEvent<T = unknown> {
  type: string;
  payload: T;
  timestamp: string;
  sessionId: string;
  traceId?: string;
}

// Base error class
export class BaseError extends Error {
  public readonly code: string;
  public readonly details?: unknown;
  public readonly cause?: Error;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: string;
  public readonly traceId: string;

  constructor(options: BaseErrorOptions) {
    super(options.message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.details = options.details;
    this.cause = options.cause;
    this.context = options.context;
    this.timestamp = new Date().toISOString();
    this.traceId = this.generateTraceId();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp,
      traceId: this.traceId,
      stack: this.stack,
    };
  }
}

// Specific error types
export class ValidationError extends BaseError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      ...options,
    });
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends BaseError {
  constructor(
    message: string = 'Authentication failed',
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'AUTHENTICATION_ERROR',
      message,
      ...options,
    });
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends BaseError {
  constructor(
    message: string = 'Authorization failed',
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'AUTHORIZATION_ERROR',
      message,
      ...options,
    });
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends BaseError {
  constructor(
    resource: string,
    id?: string,
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super({
      code: 'NOT_FOUND_ERROR',
      message,
      ...options,
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends BaseError {
  constructor(
    message: string,
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'CONFLICT_ERROR',
      message,
      ...options,
    });
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends BaseError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfter?: number,
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'RATE_LIMIT_ERROR',
      message,
      ...options,
    });
    this.name = 'RateLimitError';
  }
}

export class ExternalServiceError extends BaseError {
  constructor(
    public readonly service: string,
    message: string = 'External service error',
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      message,
      ...options,
    });
    this.name = 'ExternalServiceError';
  }
}

export class DatabaseError extends BaseError {
  constructor(
    message: string = 'Database operation failed',
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'DATABASE_ERROR',
      message,
      ...options,
    });
    this.name = 'DatabaseError';
  }
}

export class ConfigurationError extends BaseError {
  constructor(
    message: string = 'Configuration error',
    options?: Omit<BaseErrorOptions, 'code' | 'message'>
  ) {
    super({
      code: 'CONFIGURATION_ERROR',
      message,
      ...options,
    });
    this.name = 'ConfigurationError';
  }
}

// Error utilities
export class ErrorUtils {
  /**
   * Create a standardized API response for errors
   */
  static createErrorResponse<T = unknown>(
    error: BaseError | Error,
    status: number = 500,
    requestId?: string
  ): NextResponse {
    const timestamp = new Date().toISOString();
    const traceId = error instanceof BaseError ? error.traceId : this.generateTraceId();

    const errorResponse: ApiResponse<T> = {
      success: false,
      error: {
        code: error instanceof BaseError ? error.code : 'INTERNAL_ERROR',
        message: error.message,
        details: error instanceof BaseError ? error.details : undefined,
        traceId,
      },
      meta: {
        timestamp,
        requestId: requestId || traceId,
      },
    };

    return new NextResponse(JSON.stringify(errorResponse), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
        'X-Request-ID': requestId || traceId,
      },
    });
  }

  /**
   * Create a standardized success response
   */
  static createSuccessResponse<T>(
    data: T,
    status: number = 200,
    requestId?: string
  ): NextResponse {
    const timestamp = new Date().toISOString();
    const traceId = this.generateTraceId();

    const response: ApiResponse<T> = {
      success: true,
      data,
      meta: {
        timestamp,
        requestId: requestId || traceId,
      },
    };

    return new NextResponse(JSON.stringify(response), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
        'X-Request-ID': requestId || traceId,
      },
    });
  }

  /**
   * Wrap async functions with standardized error handling
   */
  static async withErrorHandling<T>(
    fn: () => Promise<T>,
    fallback?: T
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof BaseError) {
        throw error;
      }

      // Convert unknown errors to BaseError
      throw new BaseError({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error: Error): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof ExternalServiceError) return true;
    if (error instanceof DatabaseError) {
      // Common database connection errors
      const retryableCodes = [
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ECONNRESET',
        'EREADONLY',
      ];
      return retryableCodes.some(code => error.message.includes(code));
    }
    return false;
  }

  /**
   * Get error status code for HTTP responses
   */
  static getHttpStatus(error: Error): number {
    if (error instanceof ValidationError) return 400;
    if (error instanceof AuthenticationError) return 401;
    if (error instanceof AuthorizationError) return 403;
    if (error instanceof NotFoundError) return 404;
    if (error instanceof ConflictError) return 409;
    if (error instanceof RateLimitError) return 429;
    if (error instanceof ConfigurationError) return 500;
    if (error instanceof ExternalServiceError) return 502;
    if (error instanceof DatabaseError) return 503;
    return 500;
  }

  /**
   * Format error for logging
   */
  static formatForLogging(error: Error): Record<string, unknown> {
    const base = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    if (error instanceof BaseError) {
      return {
        ...base,
        code: error.code,
        details: error.details,
        context: error.context,
        timestamp: error.timestamp,
        traceId: error.traceId,
      };
    }

    return base;
  }

  private static generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Re-export NextResponse for convenience
import { NextResponse } from 'next/server';