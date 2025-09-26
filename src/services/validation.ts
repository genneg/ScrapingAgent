/**
 * Validation types and utilities for the application
 */

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrorDetail[];
  warnings: ValidationWarning[];
  score: number;
  confidence: number;
  normalizedData?: any;
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

export interface ValidationRule<T = any> {
  name: string;
  validate: (value: T) => boolean;
  message: string;
  code: string;
  severity?: 'error' | 'warning';
}

export class ValidationService {
  static validateFestivalData(data: any): ValidationResult {
    const errors: ValidationErrorDetail[] = [];
    const warnings: ValidationWarning[] = [];
    let score = 100;

    // Required fields validation
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Festival name is required',
        severity: 'error',
        code: 'REQUIRED_FIELD'
      });
      score -= 20;
    }

    if (!data.startDate || !data.endDate) {
      errors.push({
        field: 'dates',
        message: 'Start and end dates are required',
        severity: 'error',
        code: 'REQUIRED_FIELD'
      });
      score -= 20;
    }

    // Venue validation
    if (!data.venue || !data.venue.name) {
      errors.push({
        field: 'venue',
        message: 'Venue information is required',
        severity: 'error',
        code: 'REQUIRED_FIELD'
      });
      score -= 15;
    }

    // URL validation
    const urlFields = ['website', 'registrationUrl'];
    urlFields.forEach(field => {
      if (data[field]) {
        try {
          new URL(data[field]);
        } catch {
          errors.push({
            field,
            message: `Invalid ${field} URL format`,
            severity: 'error',
            code: 'INVALID_URL'
          });
          score -= 10;
        }
      }
    });

    // Email validation
    if (data.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        errors.push({
          field: 'email',
          message: 'Invalid email format',
          severity: 'error',
          code: 'INVALID_EMAIL'
        });
        score -= 10;
      }
    }

    // Phone validation (basic)
    if (data.phone) {
      const phoneRegex = /^[\+]?[\d\s\-\(\)]+$/;
      if (!phoneRegex.test(data.phone)) {
        warnings.push({
          field: 'phone',
          message: 'Phone number format may be invalid',
          code: 'INVALID_PHONE_FORMAT'
        });
        score -= 5;
      }
    }

    // Coordinate validation
    if (data.venue) {
      const { latitude, longitude } = data.venue;
      if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
        errors.push({
          field: 'venue.latitude',
          message: 'Latitude must be between -90 and 90',
          severity: 'error',
          code: 'INVALID_COORDINATE'
        });
        score -= 10;
      }

      if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
        errors.push({
          field: 'venue.longitude',
          message: 'Longitude must be between -180 and 180',
          severity: 'error',
          code: 'INVALID_COORDINATE'
        });
        score -= 10;
      }
    }

    // Description quality warnings
    if (data.description && data.description.length < 50) {
      warnings.push({
        field: 'description',
        message: 'Description is quite short and may not provide enough information',
        code: 'SHORT_DESCRIPTION'
      });
      score -= 5;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score),
      confidence: Math.max(0, score) / 100
    };
  }

  static validateUrl(url: string): { valid: boolean; error?: string } {
    try {
      new URL(url);

      // Check for valid protocols
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
      }

      // Check for localhost/private networks in production
      if (process.env.NODE_ENV === 'production') {
        const hostname = urlObj.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
            hostname.startsWith('172.') || hostname.endsWith('.local')) {
          return { valid: false, error: 'Private network addresses are not allowed' };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  static validateConfidenceScore(confidence: number): { valid: boolean; message?: string } {
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      return { valid: false, message: 'Confidence score must be a number between 0 and 1' };
    }

    if (confidence < 0.5) {
      return { valid: false, message: 'Confidence score is too low' };
    }

    if (confidence < 0.7) {
      return {
        valid: true,
        message: 'Confidence score is low - consider reviewing the extracted data'
      };
    }

    return { valid: true };
  }
}