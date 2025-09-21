import { z } from 'zod';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  normalizedData?: FestivalData;
}

export interface ValidationError {
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

// Zod schema for festival data validation
const festivalSchema = z.object({
  name: z.string().min(3, 'Festival name must be at least 3 characters'),
  description: z.string().optional(),
  startDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Invalid start date format' }
  ),
  endDate: z.string().refine(
    (date) => !isNaN(Date.parse(date)),
    { message: 'Invalid end date format' }
  ),
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
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let normalizedData = { ...data };

    try {
      logger.info('Starting festival data validation', {
        festivalName: data.name,
        startDate: data.startDate,
        endDate: data.endDate
      });

      // Zod schema validation
      const schemaResult = festivalSchema.safeParse(data);
      if (!schemaResult.success) {
        schemaResult.error.errors.forEach((error) => {
          errors.push({
            field: error.path.join('.'),
            message: error.message,
            severity: 'error',
            code: 'SCHEMA_VALIDATION',
          });
        });
      } else {
        normalizedData = schemaResult.data;
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
      logger.error('Validation failed unexpectedly', { error });
      return {
        isValid: false,
        confidence: 0,
        errors: [{
          field: 'system',
          message: 'Validation system error',
          severity: 'critical',
          code: 'VALIDATION_SYSTEM_ERROR'
        }],
        warnings: [],
        normalizedData: data,
      };
    }
  }

  private validateBusinessRules(data: FestivalData): ValidationError[] {
    const errors: ValidationError[] = [];

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
        specialties: teacher.specialties.map(s => s.trim().toLowerCase()),
      }));
    }

    // Normalize musicians
    if (normalized.musicians) {
      normalized.musicians = normalized.musicians.map(musician => ({
        ...musician,
        name: musician.name.trim().replace(/\s+/g, ' '),
        genre: musician.genre.map(g => g.trim().toLowerCase()),
      }));
    }

    // Normalize tags
    if (normalized.tags) {
      normalized.tags = normalized.tags.map(tag => tag.trim().toLowerCase());
    }

    return normalized;
  }

  private calculateValidationConfidence(
    errors: ValidationError[],
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
}

export const validationService = new ValidationService();