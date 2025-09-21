import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { configService } from '@/lib/config';
import { NextRequest, NextResponse } from 'next/server';

export interface RateLimitConfig {
  requests: number;
  windowMs: number;
  endpoint: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  limit: number;
}

export class RateLimiterService {
  /**
   * Check if request is allowed based on rate limits
   */
  async checkRateLimit(
    clientId: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - config.windowMs);
    const windowEnd = new Date(now.getTime() + config.windowMs);

    try {
      // Clean up expired entries first
      await this.cleanupExpiredEntries();

      // Find or create rate limit record
      let rateLimit = await prisma.rateLimit.findUnique({
        where: {
          clientId_endpoint: {
            clientId,
            endpoint: config.endpoint,
          },
        },
      });

      if (!rateLimit) {
        // Create new rate limit record
        rateLimit = await prisma.rateLimit.create({
          data: {
            clientId,
            endpoint: config.endpoint,
            count: 1,
            windowStart: now,
            windowEnd,
          },
        });

        logger.debug('Created new rate limit record', {
          clientId,
          endpoint: config.endpoint,
          count: 1,
        });

        return {
          allowed: true,
          remaining: config.requests - 1,
          resetTime: rateLimit.windowEnd,
          limit: config.requests,
        };
      }

      // Check if current window has expired
      if (rateLimit.windowEnd <= now) {
        // Reset window
        rateLimit = await prisma.rateLimit.update({
          where: { id: rateLimit.id },
          data: {
            count: 1,
            windowStart: now,
            windowEnd,
          },
        });

        logger.debug('Reset rate limit window', {
          clientId,
          endpoint: config.endpoint,
          count: 1,
        });

        return {
          allowed: true,
          remaining: config.requests - 1,
          resetTime: rateLimit.windowEnd,
          limit: config.requests,
        };
      }

      // Check if limit exceeded
      if (rateLimit.count >= config.requests) {
        logger.warn('Rate limit exceeded', {
          clientId,
          endpoint: config.endpoint,
          count: rateLimit.count,
          limit: config.requests,
        });

        return {
          allowed: false,
          remaining: 0,
          resetTime: rateLimit.windowEnd,
          limit: config.requests,
        };
      }

      // Increment count
      rateLimit = await prisma.rateLimit.update({
        where: { id: rateLimit.id },
        data: {
          count: rateLimit.count + 1,
        },
      });

      logger.debug('Rate limit incremented', {
        clientId,
        endpoint: config.endpoint,
        count: rateLimit.count,
      });

      return {
        allowed: true,
        remaining: config.requests - rateLimit.count,
        resetTime: rateLimit.windowEnd,
        limit: config.requests,
      };
    } catch (error) {
      logger.error('Rate limit check failed', {
        clientId,
        endpoint: config.endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fail open - allow request but log the error
      return {
        allowed: true,
        remaining: config.requests - 1,
        resetTime: new Date(now.getTime() + config.windowMs),
        limit: config.requests,
      };
    }
  }

  /**
   * Clean up expired rate limit entries
   */
  private async cleanupExpiredEntries(): Promise<void> {
    try {
      const now = new Date();
      const deleted = await prisma.rateLimit.deleteMany({
        where: {
          windowEnd: {
            lt: now,
          },
        },
      });

      if (deleted.count > 0) {
        logger.debug('Cleaned up expired rate limit entries', {
          deletedCount: deleted.count,
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired rate limit entries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get client ID from request
   */
  getClientId(request: NextRequest): string {
    // Try to get user ID from authentication token first
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // In a real implementation, you'd decode the JWT to get the user ID
      // For now, use the token as part of the client ID
      return `user:${token}`;
    }

    // Fall back to IP address
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = forwarded ? forwarded.split(',')[0].trim() : realIp || 'unknown';

    return `ip:${ip}`;
  }

  /**
   * Create rate limiting middleware
   */
  createMiddleware(config: RateLimitConfig) {
    return async (request: NextRequest): Promise<NextResponse | null> => {
      const clientId = this.getClientId(request);
      const result = await this.checkRateLimit(clientId, config);

      if (!result.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests, please try again later',
            },
            meta: {
              limit: result.limit,
              remaining: result.remaining,
              resetTime: result.resetTime.toISOString(),
            },
            timestamp: new Date().toISOString(),
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': result.limit.toString(),
              'X-RateLimit-Remaining': result.remaining.toString(),
              'X-RateLimit-Reset': result.resetTime.toISOString(),
              'Retry-After': Math.ceil((result.resetTime.getTime() - Date.now()) / 1000).toString(),
            },
          }
        );
      }

      // Add rate limit headers to successful responses
      return null;
    };
  }

  /**
   * Reset rate limits for a client (for testing or admin purposes)
   */
  async resetRateLimit(clientId: string, endpoint?: string): Promise<void> {
    try {
      if (endpoint) {
        await prisma.rateLimit.deleteMany({
          where: {
            clientId,
            endpoint,
          },
        });
      } else {
        await prisma.rateLimit.deleteMany({
          where: {
            clientId,
          },
        });
      }

      logger.info('Rate limit reset', { clientId, endpoint });
    } catch (error) {
      logger.error('Failed to reset rate limit', {
        clientId,
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get current rate limit status for a client
   */
  async getRateLimitStatus(clientId: string, endpoint: string): Promise<RateLimitResult | null> {
    try {
      const rateLimit = await prisma.rateLimit.findUnique({
        where: {
          clientId_endpoint: {
            clientId,
            endpoint,
          },
        },
      });

      if (!rateLimit) {
        return null;
      }

      const now = new Date();
      if (rateLimit.windowEnd <= now) {
        return {
          allowed: true,
          remaining: 100, // Default limit
          resetTime: rateLimit.windowEnd,
          limit: 100,
        };
      }

      return {
        allowed: rateLimit.count < 100, // Default limit
        remaining: Math.max(0, 100 - rateLimit.count),
        resetTime: rateLimit.windowEnd,
        limit: 100,
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        clientId,
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}

// Export singleton instance
export const rateLimiterService = new RateLimiterService();

// Pre-configured rate limiters for different endpoint types
export const rateLimiters = {
  // Authentication endpoints
  auth: rateLimiterService.createMiddleware({
    requests: 3,
    windowMs: 60 * 1000, // 1 minute
    endpoint: 'auth',
  }),

  // Scraping endpoints
  scraping: rateLimiterService.createMiddleware({
    requests: 10,
    windowMs: 60 * 1000, // 1 minute
    endpoint: 'scraping',
  }),

  // Upload endpoints
  upload: rateLimiterService.createMiddleware({
    requests: 5,
    windowMs: 60 * 1000, // 1 minute
    endpoint: 'upload',
  }),

  // General API endpoints
  api: rateLimiterService.createMiddleware({
    requests: 100,
    windowMs: 60 * 1000, // 1 minute
    endpoint: 'api',
  }),

  // Database write operations
  write: rateLimiterService.createMiddleware({
    requests: 20,
    windowMs: 60 * 1000, // 1 minute
    endpoint: 'write',
  }),
};