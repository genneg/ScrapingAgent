/**
 * Security constants and validation utilities for the SwingRadar application
 */

export const SECURITY_CONFIG = {
  // File upload security
  FILE_UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_MIME_TYPES: ['application/json'],
    ALLOWED_EXTENSIONS: ['.json'],
    MAX_FILENAME_LENGTH: 255,
  },

  // URL validation
  URL: {
    MAX_LENGTH: 2048,
    ALLOWED_PROTOCOLS: ['http:', 'https:'],
    BLOCKED_PATTERNS: [
      /localhost/i,
      /127\.0\.0\.1/i,
      /192\.168\./i,
      /10\./i,
      /172\.(1[6-9]|2[0-9]|3[01])\./i, // Private IP ranges
      /\.\./i, // Directory traversal
    ],
  },

  // Rate limiting
  RATE_LIMIT: {
    MAX_REQUESTS_PER_MINUTE: 60,
    MAX_UPLOADS_PER_HOUR: 10,
  },
} as const;

/**
 * File validation utilities
 */
export class FileSecurityValidator {
  /**
   * Validate file security before upload
   */
  static validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > SECURITY_CONFIG.FILE_UPLOAD.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds ${SECURITY_CONFIG.FILE_UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
      };
    }

    // Check file extension
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_EXTENSIONS.includes(extension as any)) {
      return {
        valid: false,
        error: `Only ${SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_EXTENSIONS.join(', ')} files are allowed`,
      };
    }

    // Check MIME type
    if (!SECURITY_CONFIG.FILE_UPLOAD.ALLOWED_MIME_TYPES.includes(file.type as any)) {
      return {
        valid: false,
        error: `Invalid file type. Only JSON files are accepted`,
      };
    }

    // Validate filename length
    if (file.name.length > SECURITY_CONFIG.FILE_UPLOAD.MAX_FILENAME_LENGTH) {
      return {
        valid: false,
        error: `Filename too long. Maximum ${SECURITY_CONFIG.FILE_UPLOAD.MAX_FILENAME_LENGTH} characters`,
      };
    }

    // Sanitize filename to prevent directory traversal and malicious characters
    const sanitizedName = this.sanitizeFilename(file.name);
    if (sanitizedName !== file.name) {
      return {
        valid: false,
        error: 'Filename contains invalid characters',
      };
    }

    return { valid: true };
  }

  /**
   * Validate JSON content
   */
  static async validateJsonContent(file: File): Promise<{ valid: boolean; error?: string }> {
    try {
      const text = await file.text();

      // Basic JSON parsing validation
      const parsed = JSON.parse(text);

      // Check if it's an object (expected structure)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          valid: false,
          error: 'JSON file must contain an object with festival data',
        };
      }

      // Check for required basic fields
      const requiredFields = ['name', 'startDate', 'endDate'];
      for (const field of requiredFields) {
        if (!(field in parsed)) {
          return {
            valid: false,
            error: `Missing required field: ${field}`,
          };
        }
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid JSON format',
      };
    }
  }

  /**
   * Sanitize filename to prevent directory traversal and injection attacks
   */
  private static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[\/\\:*?"<>|]/g, '_') // Replace dangerous characters
      .replace(/\.\./g, '_') // Prevent directory traversal
      .replace(/^\./, '_') // Prevent hidden files
      .replace(/\s+$/g, '') // Trim trailing whitespace
      .substring(0, SECURITY_CONFIG.FILE_UPLOAD.MAX_FILENAME_LENGTH);
  }
}

/**
 * URL validation utilities
 */
export class UrlSecurityValidator {
  /**
   * Validate URL for scraping
   */
  static validateUrl(url: string): { valid: boolean; error?: string } {
    try {
      // Basic URL validation
      const urlObj = new URL(url);

      // Check protocol
      if (!SECURITY_CONFIG.URL.ALLOWED_PROTOCOLS.includes(urlObj.protocol as any)) {
        return {
          valid: false,
          error: `Only ${SECURITY_CONFIG.URL.ALLOWED_PROTOCOLS.join(', ')} protocols are allowed`,
        };
      }

      // Check URL length
      if (url.length > SECURITY_CONFIG.URL.MAX_LENGTH) {
        return {
          valid: false,
          error: `URL too long. Maximum ${SECURITY_CONFIG.URL.MAX_LENGTH} characters`,
        };
      }

      // Check for blocked patterns
      for (const pattern of SECURITY_CONFIG.URL.BLOCKED_PATTERNS) {
        if (pattern.test(url)) {
          return {
            valid: false,
            error: 'URL contains blocked patterns or attempts to access local resources',
          };
        }
      }

      // Additional security checks
      if (urlObj.username || urlObj.password) {
        return {
          valid: false,
          error: 'URLs with credentials are not allowed',
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid URL format',
      };
    }
  }

  /**
   * Sanitize URL for display
   */
  static sanitizeUrlForDisplay(url: string): string {
    try {
      const urlObj = new URL(url);
      // Remove sensitive parts for display
      urlObj.username = '';
      urlObj.password = '';
      return urlObj.toString();
    } catch {
      return url;
    }
  }
}