// Security utilities for data sanitization and logging
import { logger } from '@/lib/logger';

// API Key patterns to detect and sanitize
const API_KEY_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/gi, // Anthropic API keys
  /AIza[a-zA-Z0-9_-]{35}/gi, // Google API keys
  /pk_[a-zA-Z0-9_-]{40,}/gi, // Stripe API keys
  /xox[bap]-[a-zA-Z0-9_-]{40,}/gi, // Slack API keys
  /gh[pousr]_[a-zA-Z0-9_-]{36}/gi, // GitHub API keys
];

// Sensitive data patterns
const SENSITIVE_PATTERNS = [
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card numbers
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, // Email addresses
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, // SSN numbers
];

export class SecurityUtils {
  /**
   * Generate a unique request ID for tracking
   */
  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate and sanitize URL for scraping (SSRF protection)
   */
  static sanitizeUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);

      // Check protocol - only allow http and https
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        logger.warn('Invalid protocol in URL', { url, protocol: urlObj.protocol });
        return null;
      }

      // Prevent localhost and private network access
      const hostname = urlObj.hostname.toLowerCase();

      // Check for localhost variants
      if (hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '::1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')) {
        logger.warn('Private network access attempted', { hostname });
        return null;
      }

      // Check for internal IP ranges in more detail
      if (this.isPrivateIp(hostname)) {
        logger.warn('Internal IP access attempted', { hostname });
        return null;
      }

      // Prevent non-standard ports
      const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
      if (port < 1 || port > 65535) {
        logger.warn('Invalid port in URL', { port });
        return null;
      }

      // Check for potentially dangerous ports
      const dangerousPorts = [22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 1433, 1521, 3306, 3389, 5432, 5900, 6379];
      if (dangerousPorts.includes(port)) {
        logger.warn('Potentially dangerous port', { port });
        // Allow common web ports (80, 443) but log others
        if (![80, 443].includes(port)) {
          return null;
        }
      }

      // Validate URL structure
      if (!urlObj.hostname || urlObj.hostname.length < 4) {
        logger.warn('Invalid hostname', { hostname: urlObj.hostname });
        return null;
      }

      // Return the normalized URL
      return urlObj.href;

    } catch (error) {
      logger.warn('URL validation failed', { url, error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  /**
   * Check if hostname resolves to a private IP
   */
  private static isPrivateIp(hostname: string): boolean {
    // Check for IP address patterns
    const ipPatterns = [
      /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local addresses
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Loopback
      /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // "This" network
      /^192\.168\.\d{1,3}\.\d{1,3}$/, // Private class C
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // Private class A
      /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/, // Private class B
    ];

    return ipPatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Sanitizes sensitive data from strings for logging
   */
  static sanitizeForLogging(input: unknown): string {
    if (typeof input !== 'string') {
      input = String(input);
    }

    let sanitized = input as string;

    // Sanitize API keys
    API_KEY_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED_API_KEY]');
    });

    // Sanitize sensitive data
    SENSITIVE_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED_SENSITIVE]');
    });

    return sanitized;
  }

  /**
   * Sanitizes an object for logging, recursively handling nested objects
   */
  static sanitizeObjectForLogging(obj: unknown, maxDepth = 3, currentDepth = 0): unknown {
    if (currentDepth >= maxDepth) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (obj === null || typeof obj !== 'object') {
      return this.sanitizeForLogging(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObjectForLogging(item, maxDepth, currentDepth + 1));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip known sensitive fields
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = this.sanitizeObjectForLogging(value, maxDepth, currentDepth + 1);
      }
    }

    return sanitized;
  }

  /**
   * Checks if a field name indicates sensitive data
   */
  private static isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password', 'pwd', 'pass', 'secret', 'token', 'key', 'apikey',
      'api_key', 'authorization', 'auth', 'creditcard', 'cardnumber',
      'ssn', 'socialsecurity', 'email', 'phonenumber', 'phone',
      'address', 'street', 'city', 'state', 'zip', 'postalcode',
    ];

    return sensitiveFields.some(field =>
      fieldName.toLowerCase().includes(field)
    );
  }

  /**
   * Validates that a string doesn't contain potential injection attacks
   */
  static isValidInput(input: string, type: 'text' | 'email' | 'url' | 'numeric' = 'text'): boolean {
    if (!input || typeof input !== 'string') return false;

    // Check for SQL injection patterns
    const sqlInjectionPatterns = [
      /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)(\s|$)/i,
      /(\s|^)(UNION|JOIN|WHERE|HAVING|GROUP BY)(\s|$)/i,
      /[';]/,
      /(\s|^)(OR|AND)\s+\d+\s*=\s*\d+/i,
      /--/,
      /\/\*/,
      /\*\//,
    ];

    // Check for XSS patterns
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe\b/i,
      /<object\b/i,
      /<embed\b/i,
      /expression\s*\(/i,
    ];

    // Basic validation by type
    switch (type) {
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return false;
        break;
      case 'url':
        try {
          new URL(input);
        } catch {
          return false;
        }
        break;
      case 'numeric':
        if (!/^-?\d*\.?\d+$/.test(input)) return false;
        break;
    }

    // Check for injection patterns
    const hasSqlInjection = sqlInjectionPatterns.some(pattern => pattern.test(input));
    const hasXss = xssPatterns.some(pattern => pattern.test(input));

    return !hasSqlInjection && !hasXss;
  }

  /**
   * Sanitizes HTML content to prevent XSS
   */
  static sanitizeHtml(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\//g, '&#x2F;');
  }

  /**
   * Generates a secure random string
   */
  static generateSecureRandom(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const randomArray = new Uint32Array(length);
    crypto.getRandomValues(randomArray);

    return Array.from(randomArray, num => chars[num % chars.length]).join('');
  }

  /**
   * Validates and sanitizes a file path to prevent directory traversal
   */
  static sanitizeFilePath(filePath: string): string {
    // Remove directory traversal attempts
    return filePath
      .replace(/\.\.\//g, '')
      .replace(/\.\.\\/g, '')
      .replace(/\//g, '_')
      .replace(/\\/g, '_')
      .replace(/^\.+/, '')
      .replace(/\.+$/, '');
  }
}