import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from './logger';
import jwt from 'jsonwebtoken';
import { rateLimiterService } from '@/services/rate-limiter';
import { configService } from '@/lib/config';
import { AuthenticationError, AuthorizationError, ErrorUtils, BaseError } from '@/lib/errors';

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
      const authError = new AuthenticationError('Missing or invalid authorization header');
      return ErrorUtils.createErrorResponse(authError, 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // For now, implement a simple token validation
    // In production, this should validate JWT or use a proper auth system
    const user = await validateToken(token);

    if (!user) {
      logger.warn('Invalid token provided');
      const tokenError = new AuthenticationError('Invalid or expired token');
      return ErrorUtils.createErrorResponse(tokenError, 401);
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
        const authzError = new AuthorizationError('Insufficient permissions to access this resource', {
          context: {
            userId: user.id,
            requiredPermissions,
            userPermissions: user.permissions
          }
        });
        return ErrorUtils.createErrorResponse(authzError, 403);
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
    logger.error('Authentication error', {
      error: ErrorUtils.formatForLogging(error instanceof Error ? error : new Error(String(error)))
    });

    const authError = error instanceof BaseError ? error : new AuthenticationError(
      'Authentication failed',
      {
        cause: error instanceof Error ? error : undefined,
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    );

    return ErrorUtils.createErrorResponse(authError, 500);
  }
}

/**
 * Validate authentication token using JWT
 */
async function validateToken(token: string): Promise<AuthUser | null> {
  try {
    // Verify the JWT token
    const jwtSecret = configService.getConfig().auth.jwtSecret;
    const decoded = jwt.verify(token, jwtSecret) as any;

    // Validate the token structure
    if (!decoded.id || !decoded.email || !decoded.role) {
      logger.warn('Invalid token structure', { decoded });
      return null;
    }

    // Return the user object
    return {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions || [],
    };
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid JWT token', { error: error.message });
    } else if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Expired JWT token');
    } else {
      logger.error('Token validation error', { error });
    }
    return null;
  }
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
 * Rate limiting middleware - delegates to database-backed rate limiter
 */
export function createRateLimiter(requests: number, windowMs: number, endpoint: string = 'api') {
  return rateLimiterService.createMiddleware({
    requests,
    windowMs,
    endpoint,
  });
}


/**
 * Generate JWT token for authenticated user
 */
export function generateJWT(user: AuthUser): string {
  const jwtSecret = configService.getConfig().auth.jwtSecret;

  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours expiration
  };

  return jwt.sign(payload, jwtSecret);
}

/**
 * Login credentials interface
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Authenticate user credentials and return JWT token
 */
export async function loginUser(credentials: LoginCredentials): Promise<{ success: boolean; token?: string; user?: AuthUser; error?: string }> {
  try {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set');
    }

    // For now, implement basic credential validation
    // In production, this should validate against a database
    const user = await validateCredentials(credentials.email, credentials.password);

    if (!user) {
      return {
        success: false,
        error: 'Invalid email or password',
      };
    }

    const token = generateJWT(user);

    logger.info('User logged in successfully', { userId: user.id, email: user.email });

    return {
      success: true,
      token,
      user,
    };
  } catch (error) {
    logger.error('Login error', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

/**
 * Validate user credentials against database
 * This is a placeholder - in production, validate against your user database
 */
async function validateCredentials(email: string, password: string): Promise<AuthUser | null> {
  // For development/demo purposes only
  // In production, validate against hashed passwords in database

  // Check environment variables for demo credentials
  const DEMO_EMAIL = process.env.DEMO_USER_EMAIL;
  const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;
  const ADMIN_EMAIL = process.env.ADMIN_USER_EMAIL;
  const ADMIN_PASSWORD = process.env.ADMIN_USER_PASSWORD;

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    return {
      id: 'admin-id',
      email: ADMIN_EMAIL,
      role: 'admin',
      permissions: ['read', 'write', 'delete', 'admin'],
    };
  }

  if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
    return {
      id: 'demo-user-id',
      email: DEMO_EMAIL,
      role: 'user',
      permissions: ['read'],
    };
  }

  return null;
}

/**
 * Refresh JWT token
 */
export async function refreshToken(token: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const user = await validateToken(token);
    if (!user) {
      return {
        success: false,
        error: 'Invalid or expired token',
      };
    }

    const newToken = generateJWT(user);
    return {
      success: true,
      token: newToken,
    };
  } catch (error) {
    logger.error('Token refresh error', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
    };
  }
}