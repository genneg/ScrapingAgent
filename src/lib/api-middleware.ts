import { NextRequest, NextResponse } from 'next/server';
import { BaseError, ErrorUtils, ValidationError, AuthenticationError, RateLimitError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { rateLimiterService } from '@/services/rate-limiter';

export interface ApiHandlerOptions {
  requireAuth?: boolean;
  permissions?: string[];
  rateLimit?: {
    requests: number;
    windowMs: number;
    endpoint: string;
  };
  validateRequest?: (request: NextRequest) => { valid: boolean; error?: string };
}

/**
 * Standardized API middleware with error handling, authentication, and rate limiting
 */
export function withApiHandler<T = unknown>(
  handler: (request: NextRequest, context?: any) => Promise<T>,
  options: ApiHandlerOptions = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      logger.debug('API request started', {
        method: request.method,
        url: request.url,
        requestId,
      });

      // Apply rate limiting if configured
      if (options.rateLimit) {
        const rateLimitResult = await rateLimiterService.checkRateLimit(
          request,
          options.rateLimit.endpoint
        );

        if (!rateLimitResult.allowed) {
          logger.warn('Rate limit exceeded', {
            requestId,
            endpoint: options.rateLimit.endpoint,
          });

          const rateLimitError = new RateLimitError(
            'Too many requests, please try again later',
            Math.ceil((rateLimitResult.resetTime.getTime() - Date.now()) / 1000)
          );

          return ErrorUtils.createErrorResponse(rateLimitError, 429, requestId);
        }
      }

      // Request validation if configured
      if (options.validateRequest) {
        const validation = options.validateRequest(request);
        if (!validation.valid) {
          const validationError = new ValidationError(validation.error || 'Invalid request');
          return ErrorUtils.createErrorResponse(validationError, 400, requestId);
        }
      }

      // Authentication if required
      let authContext;
      if (options.requireAuth) {
        // Import dynamically to avoid circular dependencies
        const { authenticateRequest } = await import('@/lib/auth');
        const authResult = await authenticateRequest(request, options.permissions || []);

        if (authResult instanceof NextResponse) {
          // Authentication failed, return the error response
          return authResult;
        }

        authContext = authResult;
      }

      // Execute the handler
      const result = await handler(request, { authContext, requestId });

      // Log successful completion
      const duration = Date.now() - startTime;
      logger.debug('API request completed', {
        requestId,
        duration,
        success: true,
      });

      // Return successful response
      return ErrorUtils.createSuccessResponse(result, 200, requestId);

    } catch (error) {
      const duration = Date.now() - startTime;

      // Log the error with context
      logger.error('API request failed', {
        requestId,
        duration,
        error: error instanceof BaseError ? ErrorUtils.formatForLogging(error) : String(error),
      });

      // Convert to appropriate error type
      let appError: BaseError;

      if (error instanceof BaseError) {
        appError = error;
      } else if (error instanceof Error) {
        appError = new BaseError({
          code: 'INTERNAL_ERROR',
          message: error.message,
          cause: error,
        });
      } else {
        appError = new BaseError({
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          details: error,
        });
      }

      // Return error response
      const status = ErrorUtils.getHttpStatus(appError);
      return ErrorUtils.createErrorResponse(appError, status, requestId);
    }
  };
}

/**
 * Helper to generate request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Helper to get client ID for rate limiting
 */
function getClientId(request: NextRequest): string {
  // Try to get user ID from authentication token first
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return `user:${token}`;
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || 'unknown';

  return `ip:${ip}`;
}

/**
 * Common request validators
 */
export const requestValidators = {
  json: (request: NextRequest) => {
    try {
      const contentType = request.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return { valid: false, error: 'Content-Type must be application/json' };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid request format' };
    }
  },

  requiredFields: (fields: string[]) => {
    return async (request: NextRequest) => {
      try {
        const body = await request.json() as Record<string, unknown>;
        const missingFields = fields.filter(field => !(field in body));

        if (missingFields.length > 0) {
          return {
            valid: false,
            error: `Missing required fields: ${missingFields.join(', ')}`
          };
        }

        return { valid: true };
      } catch {
        return { valid: false, error: 'Invalid JSON body' };
      }
    };
  },

  urlParam: (param: string) => {
    return (request: NextRequest) => {
      const url = new URL(request.url);
      const value = url.searchParams.get(param);

      if (!value) {
        return { valid: false, error: `Missing required query parameter: ${param}` };
      }

      return { valid: true };
    };
  },
};

/**
 * Common API configurations
 */
export const apiConfigs = {
  publicApi: {
    rateLimit: {
      requests: 100,
      windowMs: 60 * 1000, // 1 minute
      endpoint: 'public-api',
    },
  },

  authenticatedApi: {
    requireAuth: true,
    rateLimit: {
      requests: 50,
      windowMs: 60 * 1000, // 1 minute
      endpoint: 'authenticated-api',
    },
  },

  scrapingEndpoint: {
    requireAuth: true,
    permissions: ['read'],
    rateLimit: {
      requests: 10,
      windowMs: 60 * 1000, // 1 minute
      endpoint: 'scraping',
    },
    validateRequest: requestValidators.json,
  },

  uploadEndpoint: {
    requireAuth: true,
    permissions: ['write'],
    rateLimit: {
      requests: 5,
      windowMs: 60 * 1000, // 1 minute
      endpoint: 'upload',
    },
    validateRequest: requestValidators.json,
  },
};