import { NextResponse } from 'next/server';

// Error classes for the application

export class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(options: {
    code: string;
    message: string;
    statusCode?: number;
    details?: unknown;
    cause?: Error;
  }) {
    super(options.message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.statusCode = options.statusCode || 500;
    this.details = options.details;

    if (options.cause) {
      this.cause = options.cause;
    }

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'VALIDATION_ERROR',
      message,
      statusCode: 400,
      details,
    });
  }
}

export class ExternalServiceError extends BaseError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'EXTERNAL_SERVICE_ERROR',
      message,
      statusCode: 502,
      details,
    });
  }
}

export class AuthenticationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'AUTHENTICATION_ERROR',
      message,
      statusCode: 401,
      details,
    });
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'AUTHORIZATION_ERROR',
      message,
      statusCode: 403,
      details,
    });
  }
}

export class RateLimitError extends BaseError {
  constructor(message: string, public readonly retryAfter?: number) {
    super({
      code: 'RATE_LIMIT_ERROR',
      message,
      statusCode: 429,
    });
  }
}

export class DatabaseError extends BaseError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'DATABASE_ERROR',
      message,
      statusCode: 500,
      details,
    });
  }
}

export class ConfigurationError extends BaseError {
  constructor(message: string, details?: unknown) {
    super({
      code: 'CONFIGURATION_ERROR',
      message,
      statusCode: 500,
      details,
    });
  }
}

// Utility class for error handling
export class ErrorUtils {
  static formatForLogging(error: Error | BaseError): unknown {
    if (error instanceof BaseError) {
      return {
        name: error.name,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
        stack: error.stack,
      };
    }

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  static getHttpStatus(error: BaseError): number {
    return error.statusCode;
  }

  static createErrorResponse(
    error: BaseError,
    statusCode?: number,
    requestId?: string
  ): NextResponse {
    const responseStatus = statusCode || error.statusCode;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details && typeof error.details === 'object' ? { details: error.details } : {}),
        },
        ...(requestId && { requestId }),
        timestamp: new Date().toISOString(),
      },
      {
        status: responseStatus,
      }
    );
  }

  static createSuccessResponse(
    data: unknown,
    statusCode = 200,
    requestId?: string
  ): NextResponse {
    return NextResponse.json(
      {
        success: true,
        data,
        ...(requestId && { requestId }),
        timestamp: new Date().toISOString(),
      },
      {
        status: statusCode,
      }
    );
  }
}