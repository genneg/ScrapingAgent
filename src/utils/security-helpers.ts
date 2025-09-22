import DOMPurify from 'dompurify';

// HTML sanitization
export const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'p', 'br', 'span', 'div'],
    ALLOWED_ATTR: ['class', 'style']
  });
};

// Input sanitization
export const sanitizeInput = {
  string: (input: unknown, maxLength = 1000): string => {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, maxLength);
  },

  stringArray: (input: unknown, maxLength = 50): string[] => {
    if (!Array.isArray(input)) return [];
    return input
      .filter(item => typeof item === 'string')
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .slice(0, maxLength);
  },

  number: (input: unknown, defaultValue = 0): number => {
    const num = Number(input);
    return isNaN(num) ? defaultValue : num;
  },

  email: (input: unknown): string => {
    if (typeof input !== 'string') return '';
    return input.toLowerCase().trim().slice(0, 254);
  },

  url: (input: unknown): string => {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, 2048);
  },

  stripHtml: (input: unknown): string => {
    if (typeof input !== 'string') return '';
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }
};

// URL validation
export const isValidExternalUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

export const validateUrl = (url: string): { valid: boolean; error?: string } => {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  try {
    const urlObj = new URL(url);

    // Check protocol
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
    }

    // Prevent localhost and private networks
    const hostname = urlObj.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.endsWith('.local')) {
      return { valid: false, error: 'Access to internal or private networks is not allowed' };
    }

    // Prevent non-standard ports
    const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
    if (port < 1 || port > 65535 || port === 0) {
      return { valid: false, error: 'Invalid port number' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
};

// XSS detection
export const securityValidation = {
  containsSqlInjection: (input: string): boolean => {
    const sqlPatterns = [
      /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)(\s|$)/i,
      /(\s|^)(UNION|JOIN|WHERE|HAVING|GROUP BY)(\s|$)/i,
      /[';]/, // Potential SQL injection characters
      /(\s|^)(OR|AND)\s+\d+\s*=\s*\d+/i, // OR 1=1 patterns
    ];
    return sqlPatterns.some(pattern => pattern.test(input));
  },

  containsXss: (input: string): boolean => {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/i,
      /on\w+\s*=/i, // event handlers
      /<iframe\b/i,
      /<object\b/i,
      /<embed\b/i,
      /expression\s*\(/i, // CSS expressions
    ];
    return xssPatterns.some(pattern => pattern.test(input));
  },

  containsPathTraversal: (input: string): boolean => {
    const traversalPatterns = [
      /\.\.\//, // ../
      /\.\.\\/, // ..\
      /~\//, // ~/
      /%2e%2e%2f/i, // URL encoded ../
      /%2e%2e%5c/i, // URL encoded ..\
    ];
    return traversalPatterns.some(pattern => pattern.test(input));
  },

  isInputSafe: (input: string): { safe: boolean; reason?: string } => {
    if (securityValidation.containsSqlInjection(input)) {
      return { safe: false, reason: 'Potential SQL injection detected' };
    }
    if (securityValidation.containsXss(input)) {
      return { safe: false, reason: 'Potential XSS detected' };
    }
    if (securityValidation.containsPathTraversal(input)) {
      return { safe: false, reason: 'Potential path traversal detected' };
    }
    return { safe: true };
  }
};

// Content Security Policy helpers
export const CSP_NONCE = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(7);

// File security validation
export const validateFileUpload = (file: File): { valid: boolean; error?: string } => {
  // Check file size (10MB limit)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  // Check file type
  const allowedTypes = [
    'application/json',
    'text/plain',
    'application/xml'
  ];

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'File type not supported' };
  }

  // Check filename
  const fileName = file.name.toLowerCase();
  if (fileName.includes('.exe') || fileName.includes('.bat') || fileName.includes('.cmd')) {
    return { valid: false, error: 'Executable files not allowed' };
  }

  return { valid: true };
};

// JSON content validation
export const validateJsonContent = async (file: File): Promise<{ valid: boolean; error?: string }> => {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Basic structure validation
    if (typeof data !== 'object' || data === null) {
      return { valid: false, error: 'JSON must be an object' };
    }

    // Check for potentially malicious content
    const jsonString = JSON.stringify(data);
    if (securityValidation.containsXss(jsonString)) {
      return { valid: false, error: 'JSON contains potentially malicious content' };
    }

    if (securityValidation.containsSqlInjection(jsonString)) {
      return { valid: false, error: 'JSON contains potentially malicious SQL patterns' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid JSON format' };
  }
};

// Rate limiting helpers
export const createRateLimitKey = (identifier: string, action: string): string => {
  return `${identifier}:${action}`;
};

export const calculateRetryDelay = (attempt: number, baseDelay = 1000): number => {
  const exponentialDelay = Math.pow(2, attempt) * baseDelay;
  const jitter = Math.random() * 500;
  return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
};

// Secure token generation
export const generateSecureToken = (length = 32): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars.charAt(array[i] % chars.length);
  }
  return result;
};

// Data sanitization for display
export const sanitizeForDisplay = {
  festivalName: (name: unknown): string => {
    return sanitizeInput.string(name, 200);
  },

  description: (desc: unknown): string => {
    return sanitizeInput.string(desc, 2000);
  },

  url: (url: unknown): string => {
    const sanitized = sanitizeInput.string(url, 2048);
    return isValidExternalUrl(sanitized) ? sanitized : '';
  },

  email: (email: unknown): string => {
    const sanitized = sanitizeInput.string(email, 254);
    // Basic email validation
    if (sanitized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) {
      return sanitized;
    }
    return '';
  }
};

// Error message sanitization
export const sanitizeErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return sanitizeInput.string(error, 1000);
  }
  if (error instanceof Error) {
    return sanitizeInput.string(error.message, 1000);
  }
  return 'An unknown error occurred';
};