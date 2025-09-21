import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from './logger';

const logger = createLogger('auth');

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
  permissions: string[];
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
}

/**
 * Basic authentication middleware for API routes
 */
export async function authenticateRequest(
  request: NextRequest,
  requiredPermissions: string[] = []
): Promise<NextResponse | AuthContext> {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid authorization header');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid authorization header',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // For now, implement a simple token validation
    // In production, this should validate JWT or use a proper auth system
    const user = await validateToken(token);

    if (!user) {
      logger.warn('Invalid token provided');
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 401 }
      );
    }

    // Check required permissions
    if (requiredPermissions.length > 0) {
      const hasAllPermissions = requiredPermissions.every(permission =>
        user.permissions.includes(permission)
      );

      if (!hasAllPermissions) {
        logger.warn('Insufficient permissions', {
          userId: user.id,
          requiredPermissions,
          userPermissions: user.permissions
        });
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INSUFFICIENT_PERMISSIONS',
              message: 'Insufficient permissions to access this resource',
            },
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        );
      }
    }

    // Generate session ID for WebSocket room isolation
    const sessionId = generateSessionId(user.id);

    logger.debug('Authentication successful', { userId: user.id, sessionId });

    return {
      user,
      sessionId,
    };
  } catch (error) {
    logger.error('Authentication error', { error });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Validate authentication token
 * For demo purposes, accept a simple token
 * In production, this should validate JWT tokens
 */
async function validateToken(token: string): Promise<AuthUser | null> {
  // For development, accept a simple token
  // In production, validate JWT token here
  if (token === 'demo-admin-token') {
    return {
      id: 'demo-admin-id',
      email: 'admin@swingradar.com',
      role: 'admin',
      permissions: ['read', 'write', 'delete', 'admin'],
    };
  }

  if (token === 'demo-user-token') {
    return {
      id: 'demo-user-id',
      email: 'user@swingradar.com',
      role: 'user',
      permissions: ['read'],
    };
  }

  return null;
}

/**
 * Generate session ID for WebSocket room isolation
 */
function generateSessionId(userId: string): string {
  return `session_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Middleware factory for requiring specific permissions
 */
export function requireAuth(permissions: string[] = []) {
  return (handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>) => {
    return async (request: NextRequest): Promise<NextResponse> => {
      const authResult = await authenticateRequest(request, permissions);

      if (authResult instanceof NextResponse) {
        return authResult;
      }

      return handler(request, authResult);
    };
  };
}

/**
 * Check if user has admin role
 */
export function isAdmin(user: AuthUser): boolean {
  return user.role === 'admin';
}

/**
 * Check if user has specific permission
 */
export function hasPermission(user: AuthUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

/**
 * Rate limiting middleware
 */
export function createRateLimiter(requests: number, windowMs: number) {
  const requestsMap = new Map<string, { count: number; resetTime: number }>();

  return async (request: NextRequest): Promise<NextResponse | null> => {
    const clientId = getClientId(request);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean expired entries
    for (const [key, data] of requestsMap.entries()) {
      if (data.resetTime < now) {
        requestsMap.delete(key);
      }
    }

    let data = requestsMap.get(clientId);

    if (!data || data.resetTime < windowStart) {
      data = { count: 0, resetTime: now + windowMs };
      requestsMap.set(clientId, data);
    }

    if (data.count >= requests) {
      logger.warn('Rate limit exceeded', { clientId, count: data.count });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 429 }
      );
    }

    data.count++;
    return null; // Allow request to proceed
  };
}

/**
 * Get client ID for rate limiting
 */
function getClientId(request: NextRequest): string {
  // Use IP address or authentication token for client identification
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || 'anonymous';

  return `${ip}:${token}`;
}