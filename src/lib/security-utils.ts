// Security utilities for data sanitization and logging

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