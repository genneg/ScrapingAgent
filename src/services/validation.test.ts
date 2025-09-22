import { validationService } from './validation';
import { FestivalData } from '@/types';

describe('ValidationService', () => {
  const validFestivalData: FestivalData = {
    name: 'Test Festival',
    description: 'A test festival',
    website: 'https://testfestival.com',
    email: 'info@testfestival.com',
    phone: '+1234567890',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-03'),
    timezone: 'UTC',
    venue: {
      name: 'Test Venue',
      address: '123 Test St',
      city: 'Test City',
      state: 'Test State',
      country: 'Test Country',
      postalCode: '12345',
      latitude: 40.7128,
      longitude: -74.0060,
    },
    teachers: [
      { name: 'Teacher 1', specialties: ['Lindy Hop', 'Balboa'] },
      { name: 'Teacher 2', specialties: ['Blues', 'Charleston'] },
    ],
    musicians: [
      { name: 'Band 1', genre: ['Swing', 'Jazz'] },
      { name: 'Band 2', genre: ['Blues'] },
    ],
    prices: [
      { type: 'Early Bird', amount: 150, currency: 'USD' },
      { type: 'Regular', amount: 200, currency: 'USD', deadline: new Date('2024-05-15') },
    ],
    tags: ['swing', 'lindy', 'blues'],
  };

  describe('validateFestivalData', () => {
    it('should validate correct festival data', () => {
      const result = validationService.validateFestivalData(validFestivalData);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should reject festival with missing required fields', () => {
      const invalidData = { ...validFestivalData, name: '' };
      const result = validationService.validateFestivalData(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('name'))).toBe(true);
    });

    it('should reject festival with invalid dates', () => {
      const invalidData = {
        ...validFestivalData,
        startDate: new Date('2024-06-03'),
        endDate: new Date('2024-06-01')
      };
      const result = validationService.validateFestivalData(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('date'))).toBe(true);
    });

    it('should reject festival with invalid email', () => {
      const invalidData = { ...validFestivalData, email: 'invalid-email' };
      const result = validationService.validateFestivalData(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('email'))).toBe(true);
    });

    it('should reject festival with invalid URL', () => {
      const invalidData = { ...validFestivalData, website: 'invalid-url' };
      const result = validationService.validateFestivalData(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('URL'))).toBe(true);
    });

    it('should warn about missing optional fields', () => {
      const minimalData = {
        name: 'Test Festival',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-03'),
      };
      const result = validationService.validateFestivalData(minimalData as FestivalData);

      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1);
    });

    it('should handle invalid coordinates', () => {
      const invalidData = {
        ...validFestivalData,
        venue: {
          ...validFestivalData.venue!,
          latitude: 91, // Invalid latitude
          longitude: -181, // Invalid longitude
        }
      };
      const result = validationService.validateFestivalData(invalidData);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('coordinate'))).toBe(true);
    });

    it('should validate teacher data', () => {
      const dataWithInvalidTeacher = {
        ...validFestivalData,
        teachers: [{ name: '', specialties: ['Swing'] }]
      };
      const result = validationService.validateFestivalData(dataWithInvalidTeacher);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('teacher'))).toBe(true);
    });

    it('should validate price data', () => {
      const dataWithInvalidPrice = {
        ...validFestivalData,
        prices: [{ type: '', amount: -100, currency: 'USD' }]
      };
      const result = validationService.validateFestivalData(dataWithInvalidPrice);

      expect(result.success).toBe(false);
      expect(result.errors.some(error => error.includes('price'))).toBe(true);
    });
  });

  describe('calculateConfidenceScore', () => {
    it('should calculate high confidence for complete data', () => {
      const result = validationService.validateFestivalData(validFestivalData);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should calculate lower confidence for incomplete data', () => {
      const minimalData = {
        name: 'Test Festival',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-03'),
      };
      const result = validationService.validateFestivalData(minimalData as FestivalData);
      expect(result.confidence).toBeLessThan(0.8);
    });

    it('should calculate medium confidence for mostly complete data', () => {
      const mediumData = {
        ...validFestivalData,
        venue: undefined,
        teachers: [],
        musicians: [],
      };
      const result = validationService.validateFestivalData(mediumData);
      expect(result.confidence).toBeGreaterThan(0.6);
      expect(result.confidence).toBeLessThan(0.9);
    });
  });

  describe('validateRequiredFields', () => {
    it('should pass validation with all required fields', () => {
      const requiredData = {
        name: 'Test Festival',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-03'),
      };
      const result = validationService.validateRequiredFields(requiredData as FestivalData);
      expect(result.success).toBe(true);
    });

    it('should fail validation with missing name', () => {
      const invalidData = {
        name: '',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-03'),
      };
      const result = validationService.validateRequiredFields(invalidData as FestivalData);
      expect(result.success).toBe(false);
    });

    it('should fail validation with missing start date', () => {
      const invalidData = {
        name: 'Test Festival',
        startDate: undefined,
        endDate: new Date('2024-06-03'),
      };
      const result = validationService.validateRequiredFields(invalidData as FestivalData);
      expect(result.success).toBe(false);
    });
  });

  describe('validateBusinessRules', () => {
    it('should pass validation with valid business rules', () => {
      const result = validationService.validateBusinessRules(validFestivalData);
      expect(result.success).toBe(true);
    });

    it('should fail validation with festival in the past', () => {
      const pastData = {
        ...validFestivalData,
        startDate: new Date('2020-06-01'),
        endDate: new Date('2020-06-03'),
      };
      const result = validationService.validateBusinessRules(pastData);
      expect(result.success).toBe(false);
    });

    it('should warn about very long festival duration', () => {
      const longData = {
        ...validFestivalData,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-15'), // 14 days
      };
      const result = validationService.validateBusinessRules(longData);
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});