import { NextRequest, NextResponse } from 'next/server';
import { scrapingService } from '@/services/scraping';
import { logger } from '@/lib/logger';
import { rateLimiterService } from '@/services/rate-limiter-simple';
import { SecurityUtils } from '@/lib/security-utils';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = SecurityUtils.generateRequestId();

  try {
    logger.info('Scraping request started', { requestId });

    // Rate limiting
    const rateLimitResult = await rateLimiterService.checkRateLimit(request, 'scraping');
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', {
        requestId,
        ip: request.ip,
        limit: rateLimitResult.limit
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: rateLimitResult.retryAfter
        },
        {
          status: 429,
          headers: rateLimitResult.retryAfter
            ? { 'Retry-After': rateLimitResult.retryAfter.toString() }
            : undefined
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      logger.warn('Invalid request body', { requestId, body });
      return NextResponse.json(
        {
          success: false,
          error: 'URL is required and must be a string'
        },
        { status: 400 }
      );
    }

    // Security: Validate and sanitize URL with SSRF protection
    const sanitizedUrl = SecurityUtils.sanitizeUrl(url);
    if (!sanitizedUrl) {
      logger.warn('Invalid URL format', { requestId, url });
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid URL format or potentially malicious URL detected'
        },
        { status: 400 }
      );
    }

    logger.info('Starting festival scraping', {
      requestId,
      url: sanitizedUrl
    });

    // Generate session ID for WebSocket tracking
    const sessionId = SecurityUtils.generateRequestId();

    // Execute scraping with WebSocket progress tracking
    const result = await scrapingService.scrapeFestivalUrl(sanitizedUrl, sessionId);

    const processingTime = Date.now() - startTime;
    logger.info('Scraping request completed', {
      requestId,
      sessionId,
      success: result.success,
      confidence: result.confidence,
      processingTime
    });

    return NextResponse.json({
      success: result.success,
      data: result.data,
      confidence: result.confidence,
      error: result.error,
      metadata: result.metadata,
      sessionId // Include session ID for client WebSocket connection
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Scraping request failed', {
      requestId,
      error: errorMessage,
      processingTime
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error'
      },
      { status: 500 }
    );
  }
}