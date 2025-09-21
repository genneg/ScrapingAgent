import { z } from 'zod';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';
import { ValidationError as AppValidationError, BaseError, ErrorUtils } from '@/lib/errors';

// Define validation utilities directly (consolidated from lib/validation)
// Price type enum
const priceTypeEnum = z.enum(['early_bird', 'regular', 'late', 'student', 'local', 'vip', 'donation']);

// Currency enum
const currencyEnum = z.enum(['USD', 'EUR', 'GBP', 'CHF']);

// Define validation schemas with extendable type
const validationSchemasBase = {
  // URL validation with security checks
  url: z.string()
    .min(1, 'URL is required')
    .max(2048, 'URL is too long')
    .url('Invalid URL format')
    .refine(
      (url) => {
        try {
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.toLowerCase();

          // Block localhost and private networks
          return !(
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') ||
            hostname.startsWith('10.') ||
            hostname.startsWith('172.') ||
            hostname.endsWith('.local')
          );
        } catch {
          return false;
        }
      },
      'Access to internal or private networks is not allowed'
    )
    .refine(
      (url) => {
        try {
          const urlObj = new URL(url);
          return ['http:', 'https:'].includes(urlObj.protocol);
        } catch {
          return false;
        }
      },
      'Only HTTP and HTTPS protocols are allowed'
    ),

  // Email validation
  email: z.string()
    .email('Invalid email format')
    .max(254, 'Email is too long')
    .transform((email) => email.toLowerCase().trim()),

  // Festival name validation
  festivalName: z.string()
    .min(1, 'Festival name is required')
    .max(200, 'Festival name is too long')
    .transform((name) => name.trim()),

  // Date validation
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .refine(
      (dateStr) => {
        try {
          const date = new Date(dateStr);
          return !isNaN(date.getTime());
        } catch {
          return false;
        }
      },
      'Invalid date'
    ),

  // File upload validation
  fileUpload: z.object({
    filename: z.string()
      .min(1, 'Filename is required')
      .max(255, 'Filename is too long')
      .refine(
        (name) => !/[<>:"/\\|?*]/.test(name),
        'Filename contains invalid characters'
      ),
    mimetype: z.string()
      .refine(
        (type) => [
          'application/json',
          'text/plain',
          'application/xml'
        ].includes(type),
        'Unsupported file type'
      ),
    size: z.number()
      .min(1, 'File cannot be empty')
      .max(5 * 1024 * 1024, 'File size cannot exceed 5MB'), // 5MB limit
  }),
};

// Export the schemas with additional properties
export const validationSchemas = {
  ...validationSchemasBase,
  // Login credentials validation (defined after to avoid circular reference)
  // Scraping request validation (defined after to avoid circular reference)
  loginCredentials: {} as any, // Will be defined below
  scrapingRequest: {} as any, // Will be defined below
};

// Add schemas that reference others to avoid circular references
validationSchemas.loginCredentials = z.object({
  email: validationSchemas.email,
  password: z.string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password is too long'),
});

validationSchemas.scrapingRequest = z.object({
  url: validationSchemas.url,
  confidenceThreshold: z.number()
    .min(0, 'Confidence threshold must be between 0 and 1')
    .max(1, 'Confidence threshold must be between 0 and 1')
    .optional(),
});

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  errors: ValidationErrorDetail[];
  warnings: ValidationWarning[];
  normalizedData?: FestivalData;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  severity: 'critical' | 'error' | 'warning';
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

// Schema for raw festival data (with string dates)
const rawFestivalSchema = z.object({
  name: z.string().min(3, 'Festival name must be at least 3 characters'),
  description: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  venue: z.object({
    name: z.string().min(1, 'Venue name is required'),
    address: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().optional(),
    country: z.string().min(1, 'Country is required'),
    postalCode: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  }).optional(),
  website: z.string().url('Invalid website URL').optional().or(z.literal('')),
  registrationUrl: z.string().url('Invalid registration URL').optional().or(z.literal('')),
  teachers: z.array(z.object({
    name: z.string().min(1, 'Teacher name is required'),
    specialties: z.array(z.string()),
  })).default([]),
  musicians: z.array(z.object({
    name: z.string().min(1, 'Musician name is required'),
    genre: z.array(z.string()),
  })).default([]),
  prices: z.array(z.object({
    type: z.enum(['early_bird', 'regular', 'late', 'student', 'local', 'vip', 'donation']),
    amount: z.number().positive('Amount must be positive'),
    currency: z.string().min(3, 'Currency code required'),
    deadline: z.string().optional(),
    description: z.string().optional(),
  })).default([]),
  tags: z.array(z.string()).default([]),
  timezone: z.string().default('UTC'),
}).refine(
  (data) => new Date(data.endDate) >= new Date(data.startDate),
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

export class ValidationService {
  async validateFestivalData(data: FestivalData): Promise<ValidationResult> {
    const errors: ValidationErrorDetail[] = [];
    const warnings: ValidationWarning[] = [];
    let normalizedData = { ...data };

    try {
      logger.info('Starting festival data validation', {
        festivalName: data.name,
        startDate: data.startDate,
        endDate: data.endDate
      });

      // Convert FestivalData to raw format for validation
      const rawData = this.festivalDataToRaw(data);

      // Zod schema validation
      const schemaResult = rawFestivalSchema.safeParse(rawData);
      if (!schemaResult.success) {
        schemaResult.error.issues.forEach((issue) => {
          errors.push({
            field: issue.path.join('.'),
            message: issue.message,
            severity: 'error',
            code: 'SCHEMA_VALIDATION',
          });
        });
      } else {
        // Convert back to FestivalData with proper Date objects
        normalizedData = this.rawDataToFestivalData(schemaResult.data);
      }

      // Business rule validations
      const businessRuleErrors = this.validateBusinessRules(normalizedData);
      errors.push(...businessRuleErrors);

      // Data quality validations
      const qualityWarnings = this.validateDataQuality(normalizedData);
      warnings.push(...qualityWarnings);

      // Normalize data
      normalizedData = this.normalizeData(normalizedData);

      // Calculate confidence score
      const confidence = this.calculateValidationConfidence(errors, warnings, normalizedData);

      const isValid = errors.filter(e => e.severity === 'critical').length === 0;

      logger.info('Validation completed', {
        isValid,
        confidence,
        errorsCount: errors.length,
        warningsCount: warnings.length
      });

      return {
        isValid,
        confidence,
        errors,
        warnings,
        normalizedData,
      };

    } catch (error) {
      logger.error('Validation failed unexpectedly', {
        error: ErrorUtils.formatForLogging(error instanceof Error ? error : new Error(String(error)))
      });

      const systemError = error instanceof BaseError ? error : new BaseError({
        code: 'VALIDATION_SYSTEM_ERROR',
        message: error instanceof Error ? error.message : 'Validation system error',
        cause: error instanceof Error ? error : undefined,
      });

      return {
        isValid: false,
        confidence: 0,
        errors: [{
          field: 'system',
          message: systemError.message,
          severity: 'critical',
          code: systemError.code
        }],
        warnings: [],
        normalizedData: data,
      };
    }
  }

  private validateBusinessRules(data: FestivalData): ValidationErrorDetail[] {
    const errors: ValidationErrorDetail[] = [];

    // Date validations
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      const now = new Date();

      // Festival should be in the future or recently past
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      if (start < oneYearAgo) {
        errors.push({
          field: 'startDate',
          message: 'Festival start date is too far in the past',
          severity: 'warning',
          code: 'DATE_TOO_OLD'
        });
      }

      // Festival duration should be reasonable (max 30 days)
      const durationDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (durationDays > 30) {
        errors.push({
          field: 'endDate',
          message: 'Festival duration exceeds 30 days',
          severity: 'warning',
          code: 'DURATION_TOO_LONG'
        });
      }
    }

    // Teacher validations
    if (data.teachers && data.teachers.length > 0) {
      data.teachers.forEach((teacher, index) => {
        if (!teacher.specialties || teacher.specialties.length === 0) {
          errors.push({
            field: `teachers.${index}.specialties`,
            message: 'Teacher should have at least one specialty',
            severity: 'warning',
            code: 'MISSING_SPECIALTIES'
          });
        }
      });
    }

    // Musician validations
    if (data.musicians && data.musicians.length > 0) {
      data.musicians.forEach((musician, index) => {
        if (!musician.genre || musician.genre.length === 0) {
          errors.push({
            field: `musicians.${index}.genre`,
            message: 'Musician should have at least one genre',
            severity: 'warning',
            code: 'MISSING_GENRE'
          });
        }
      });
    }

    // Price validations
    if (data.prices && data.prices.length > 0) {
      data.prices.forEach((price, index) => {
        if (price.amount <= 0) {
          errors.push({
            field: `prices.${index}.amount`,
            message: 'Price amount must be positive',
            severity: 'error',
            code: 'INVALID_PRICE_AMOUNT'
          });
        }

        if (price.deadline) {
          const deadline = new Date(price.deadline);
          const start = new Date(data.startDate);
          if (deadline > start) {
            errors.push({
              field: `prices.${index}.deadline`,
              message: 'Price deadline must be before festival start',
              severity: 'error',
              code: 'INVALID_DEADLINE'
            });
          }
        }
      });
    }

    return errors;
  }

  private validateDataQuality(data: FestivalData): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Check for missing venue information
    if (!data.venue || !data.venue.city) {
      warnings.push({
        field: 'venue.city',
        message: 'City information is missing',
        code: 'MISSING_CITY'
      });
    }

    // Check for missing contact information
    if (!data.website && !data.registrationUrl) {
      warnings.push({
        field: 'contact',
        message: 'No website or registration URL provided',
        code: 'MISSING_CONTACT_INFO'
      });
    }

    // Check data completeness
    const completeness = this.calculateDataCompleteness(data);
    if (completeness < 0.5) {
      warnings.push({
        field: 'completeness',
        message: 'Data completeness is below 50%',
        code: 'LOW_COMPLETENESS'
      });
    }

    // Check for suspicious patterns
    if (data.name && data.name.toLowerCase().includes('test')) {
      warnings.push({
        field: 'name',
        message: 'Festival name contains "test" - may be test data',
        code: 'SUSPICIOUS_NAME'
      });
    }

    return warnings;
  }

  private normalizeData(data: FestivalData): FestivalData {
    const normalized = { ...data };

    // Normalize strings
    if (normalized.name) {
      normalized.name = normalized.name.trim().replace(/\s+/g, ' ');
    }

    if (normalized.description) {
      normalized.description = normalized.description.trim().replace(/\s+/g, ' ');
    }

    // Normalize venue
    if (normalized.venue) {
      normalized.venue = {
        ...normalized.venue,
        name: normalized.venue.name?.trim().replace(/\s+/g, ' ') || '',
        address: normalized.venue.address?.trim().replace(/\s+/g, ' ') || '',
        city: normalized.venue.city?.trim().replace(/\s+/g, ' ') || '',
        country: normalized.venue.country?.trim().replace(/\s+/g, ' ') || '',
      };
    }

    // Normalize teachers
    if (normalized.teachers) {
      normalized.teachers = normalized.teachers.map(teacher => ({
        ...teacher,
        name: teacher.name.trim().replace(/\s+/g, ' '),
        specialties: teacher.specialties?.map(s => s.trim().toLowerCase()) || [],
      }));
    }

    // Normalize musicians
    if (normalized.musicians) {
      normalized.musicians = normalized.musicians.map(musician => ({
        ...musician,
        name: musician.name.trim().replace(/\s+/g, ' '),
        genre: musician.genre?.map(g => g.trim().toLowerCase()) || [],
      }));
    }

    // Normalize tags
    if (normalized.tags) {
      normalized.tags = normalized.tags.map(tag => tag.trim().toLowerCase());
    }

    return normalized;
  }

  private calculateValidationConfidence(
    errors: ValidationErrorDetail[],
    warnings: ValidationWarning[],
    data: FestivalData
  ): number {
    let confidence = 1.0;

    // Penalize for errors
    const criticalErrors = errors.filter(e => e.severity === 'critical').length;
    const regularErrors = errors.filter(e => e.severity === 'error').length;

    confidence -= (criticalErrors * 0.3); // Critical errors reduce confidence significantly
    confidence -= (regularErrors * 0.1);   // Regular errors reduce confidence moderately

    // Penalize for warnings
    confidence -= (warnings.length * 0.05);

    // Boost for data completeness
    const completeness = this.calculateDataCompleteness(data);
    confidence += (completeness * 0.2);

    // Boost for required fields
    if (data.name && data.startDate && data.endDate && data.venue?.name) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private calculateDataCompleteness(data: FestivalData): number {
    const fields = [
      'name', 'description', 'startDate', 'endDate', 'website', 'registrationUrl'
    ];
    const venueFields = ['name', 'address', 'city', 'country'];

    let presentFields = 0;
    let totalFields = fields.length;

    // Check main fields
    fields.forEach(field => {
      if (data[field as keyof FestivalData]) {
        presentFields++;
      }
    });

    // Check venue fields
    if (data.venue) {
      totalFields += venueFields.length;
      venueFields.forEach(field => {
        if (data.venue![field as keyof typeof data.venue]) {
          presentFields++;
        }
      });
    }

    // Check arrays
    if (data.teachers && data.teachers.length > 0) presentFields++;
    if (data.musicians && data.musicians.length > 0) presentFields++;
    if (data.prices && data.prices.length > 0) presentFields++;
    if (data.tags && data.tags.length > 0) presentFields++;

    totalFields += 4; // For the array checks

    return presentFields / totalFields;
  }

  private festivalDataToRaw(data: FestivalData): any {
    return {
      ...data,
      startDate: data.startDate instanceof Date ? data.startDate.toISOString().split('T')[0] : data.startDate,
      endDate: data.endDate instanceof Date ? data.endDate.toISOString().split('T')[0] : data.endDate,
      registrationDeadline: data.registrationDeadline instanceof Date ?
        data.registrationDeadline.toISOString().split('T')[0] : data.registrationDeadline,
      prices: data.prices?.map(price => ({
        ...price,
        deadline: price.deadline instanceof Date ?
          price.deadline.toISOString().split('T')[0] : price.deadline
      })) || []
    };
  }

  private rawDataToFestivalData(rawData: any): FestivalData {
    return {
      ...rawData,
      startDate: new Date(rawData.startDate),
      endDate: new Date(rawData.endDate),
      registrationDeadline: rawData.registrationDeadline ? new Date(rawData.registrationDeadline) : undefined,
      prices: rawData.prices?.map((price: any) => ({
        ...price,
        deadline: price.deadline ? new Date(price.deadline) : undefined
      })) || []
    };
  }
}

export const validationService = new ValidationService();

// Input sanitization utilities (consolidated from lib/validation)
export const sanitizeInput = {
  // Sanitize string input
  string: (input: unknown, maxLength = 1000): string => {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, maxLength);
  },

  // Sanitize array of strings
  stringArray: (input: unknown, maxLength = 50): string[] => {
    if (!Array.isArray(input)) return [];
    return input
      .filter(item => typeof item === 'string')
      .map(item => item.trim())
      .filter(item => item.length > 0)
      .slice(0, maxLength);
  },

  // Sanitize number
  number: (input: unknown, defaultValue = 0): number => {
    const num = Number(input);
    return isNaN(num) ? defaultValue : num;
  },

  // Sanitize email
  email: (input: unknown): string => {
    if (typeof input !== 'string') return '';
    return input.toLowerCase().trim().slice(0, 254);
  },

  // Sanitize URL
  url: (input: unknown): string => {
    if (typeof input !== 'string') return '';
    return input.trim().slice(0, 2048);
  },

  // Remove HTML/JS from string
  stripHtml: (input: unknown): string => {
    if (typeof input !== 'string') return '';
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  },
};

// Security validation utilities
export const securityValidation = {
  // Check for SQL injection patterns
  containsSqlInjection: (input: string): boolean => {
    const sqlPatterns = [
      /(\s|^)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)(\s|$)/i,
      /(\s|^)(UNION|JOIN|WHERE|HAVING|GROUP BY)(\s|$)/i,
      /[';]/, // Potential SQL injection characters
      /(\s|^)(OR|AND)\s+\d+\s*=\s*\d+/i, // OR 1=1 patterns
    ];
    return sqlPatterns.some(pattern => pattern.test(input));
  },

  // Check for XSS patterns
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

  // Check for path traversal patterns
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

  // Comprehensive security check
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
  },
};

// Validation error helper
export class ValidationErrorHelper extends Error {
  constructor(
    message: string,
    public field?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Generic validation function
export async function validateInput<T>(
  data: unknown,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: ValidationErrorHelper }> {
  try {
    const result = await schema.parseAsync(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return {
        success: false,
        error: new ValidationErrorHelper(
          firstError.message,
          firstError.path.join('.'),
          error.issues
        ),
      };
    }
    return {
      success: false,
      error: new ValidationErrorHelper('Validation failed'),
    };
  }
}

// Rate limiting configuration
export const rateLimitConfig = {
  scraping: { requests: 10, windowMs: 60 * 1000 }, // 10 requests per minute
  upload: { requests: 5, windowMs: 60 * 1000 }, // 5 uploads per minute
  login: { requests: 3, windowMs: 60 * 1000 }, // 3 login attempts per minute
  api: { requests: 100, windowMs: 60 * 1000 }, // 100 API requests per minute
};