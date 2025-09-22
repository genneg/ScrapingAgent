import { NextRequest } from 'next/server';
import { POST } from './route';
import { prisma } from '@/lib/prisma';
import { DatabaseService } from '@/services/database';
import { SecurityUtils } from '@/lib/security-utils';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/services/database');
jest.mock('@/lib/security-utils');
jest.mock('@/lib/logger');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockDatabaseService = DatabaseService as jest.MockedClass<typeof DatabaseService>;
const mockSecurityUtils = SecurityUtils as jest.Mocked<typeof SecurityUtils>;

describe('POST /api/save-data', () => {
  const mockFestivalData = {
    name: 'Test Festival',
    startDate: new Date('2024-06-01'),
    endDate: new Date('2024-06-03'),
    description: 'Test description',
    website: 'https://test.com',
    email: 'test@test.com',
    venue: {
      name: 'Test Venue',
      address: '123 Test St',
      city: 'Test City',
      country: 'Test Country',
    },
    teachers: [{ name: 'Test Teacher', specialties: ['Swing'] }],
    musicians: [{ name: 'Test Band', genre: ['Jazz'] }],
    prices: [{ type: 'Regular', amount: 100, currency: 'USD' }],
    tags: ['swing', 'test'],
  };

  const mockRequestId = 'test-request-id';
  const mockConfidence = 0.85;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSecurityUtils.generateRequestId.mockReturnValue(mockRequestId);

    // Mock successful database import
    const mockDbInstance = new mockDatabaseService();
    mockDbInstance.importFestivalData.mockResolvedValue({
      success: true,
      festivalId: 'test-festival-id',
      errors: [],
      warnings: [],
      stats: {
        venuesCreated: 1,
        teachersCreated: 1,
        musiciansCreated: 1,
        pricesCreated: 1,
        tagsCreated: 2,
      },
    });

    mockDatabaseService.mockImplementation(() => mockDbInstance);
  });

  it('should return 400 if data is missing', async () => {
    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ confidence: mockConfidence }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
    expect(data.error.message).toBe('Data and confidence are required');
  });

  it('should return 400 if confidence is missing', async () => {
    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_REQUEST');
    expect(data.error.message).toBe('Data and confidence are required');
  });

  it('should return 400 if data structure is invalid', async () => {
    const invalidData = {
      name: '', // Invalid: empty name
      startDate: 'invalid-date', // Invalid: not a Date
    };

    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: invalidData, confidence: mockConfidence }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_DATA');
    expect(data.error.message).toBe('Invalid festival data structure');
  });

  it('should return 500 if database import fails', async () => {
    const mockDbInstance = new mockDatabaseService();
    mockDbInstance.importFestivalData.mockResolvedValue({
      success: false,
      errors: ['Database error'],
      warnings: [],
      stats: {
        venuesCreated: 0,
        teachersCreated: 0,
        musiciansCreated: 0,
        pricesCreated: 0,
        tagsCreated: 0,
      },
    });

    mockDatabaseService.mockImplementation(() => mockDbInstance);

    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData, confidence: mockConfidence }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('IMPORT_FAILED');
    expect(data.error.message).toBe('Database error');
    expect(data.error.details.errors).toEqual(['Database error']);
  });

  it('should return 200 on successful import', async () => {
    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData, confidence: mockConfidence }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.festivalId).toBe('test-festival-id');
    expect(data.data.stats.venuesCreated).toBe(1);
    expect(data.data.stats.teachersCreated).toBe(1);
    expect(data.data.stats.musiciansCreated).toBe(1);
    expect(data.data.stats.pricesCreated).toBe(1);
    expect(data.data.stats.tagsCreated).toBe(2);
    expect(data.meta.confidence).toBe(mockConfidence);
    expect(data.meta.requestId).toBe(mockRequestId);
  });

  it('should call database service with correct parameters', async () => {
    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData, confidence: mockConfidence }),
    });

    await POST(request);

    expect(mockDatabaseService).toHaveBeenCalledWith(prisma);
    const mockDbInstance = mockDatabaseService.mock.instances[0];
    expect(mockDbInstance.importFestivalData).toHaveBeenCalledWith(mockFestivalData, {
      geocodeVenue: true,
      skipDuplicates: false,
    });
  });

  it('should handle unexpected errors gracefully', async () => {
    const mockDbInstance = new mockDatabaseService();
    mockDbInstance.importFestivalData.mockRejectedValue(new Error('Unexpected error'));

    mockDatabaseService.mockImplementation(() => mockDbInstance);

    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData, confidence: mockConfidence }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INTERNAL_ERROR');
    expect(data.error.message).toBe('An unexpected error occurred while saving data');
  });

  it('should generate request ID for each request', async () => {
    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData, confidence: mockConfidence }),
    });

    await POST(request);

    expect(mockSecurityUtils.generateRequestId).toHaveBeenCalledTimes(1);
  });

  it('should include timing information in response', async () => {
    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData, confidence: mockConfidence }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.meta.duration).toBeDefined();
    expect(typeof data.meta.duration).toBe('number');
    expect(data.meta.duration).toBeGreaterThanOrEqual(0);
  });

  it('should include timestamp in response', async () => {
    const request = new NextRequest('https://localhost:3000/api/save-data', {
      method: 'POST',
      body: JSON.stringify({ data: mockFestivalData, confidence: mockConfidence }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.meta.timestamp).toBeDefined();
    expect(new Date(data.meta.timestamp)).toBeInstanceOf(Date);
  });

  describe('Data Validation', () => {
    it('should reject data without required name field', () => {
      const invalidData = {
        ...mockFestivalData,
        name: undefined,
      };

      const isValid = isValidFestivalData(invalidData);
      expect(isValid).toBe(false);
    });

    it('should reject data without required startDate', () => {
      const invalidData = {
        ...mockFestivalData,
        startDate: undefined,
      };

      const isValid = isValidFestivalData(invalidData);
      expect(isValid).toBe(false);
    });

    it('should reject data without required endDate', () => {
      const invalidData = {
        ...mockFestivalData,
        endDate: undefined,
      };

      const isValid = isValidFestivalData(invalidData);
      expect(isValid).toBe(false);
    });

    it('should reject data with invalid startDate type', () => {
      const invalidData = {
        ...mockFestivalData,
        startDate: '2024-06-01', // string instead of Date
      };

      const isValid = isValidFestivalData(invalidData);
      expect(isValid).toBe(false);
    });

    it('should reject data with invalid endDate type', () => {
      const invalidData = {
        ...mockFestivalData,
        endDate: '2024-06-03', // string instead of Date
      };

      const isValid = isValidFestivalData(invalidData);
      expect(isValid).toBe(false);
    });

    it('should accept valid data structure', () => {
      const isValid = isValidFestivalData(mockFestivalData);
      expect(isValid).toBe(true);
    });

    it('should accept minimal valid data', () => {
      const minimalData = {
        name: 'Test Festival',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-03'),
      };

      const isValid = isValidFestivalData(minimalData);
      expect(isValid).toBe(true);
    });

    it('should handle optional fields gracefully', () => {
      const dataWithOptionalFields = {
        ...mockFestivalData,
        description: undefined,
        website: undefined,
        email: undefined,
        phone: undefined,
        venue: undefined,
        teachers: undefined,
        musicians: undefined,
        prices: undefined,
        tags: undefined,
      };

      const isValid = isValidFestivalData(dataWithOptionalFields);
      expect(isValid).toBe(true);
    });
  });
});

// Helper function to test data validation (copied from the route file)
function isValidFestivalData(data: unknown): data is any {
  if (!data || typeof data !== 'object') return false;

  const festival = data as any;

  // Required fields
  if (!festival.name || typeof festival.name !== 'string') return false;
  if (!festival.startDate || !(festival.startDate instanceof Date)) return false;
  if (!festival.endDate || !(festival.endDate instanceof Date)) return false;

  // Optional fields validation
  if (festival.description && typeof festival.description !== 'string') return false;
  if (festival.website && typeof festival.website !== 'string') return false;
  if (festival.email && typeof festival.email !== 'string') return false;
  if (festival.phone && typeof festival.phone !== 'string') return false;

  // Venue validation
  if (festival.venue) {
    if (!festival.venue.name || typeof festival.venue.name !== 'string') return false;
  }

  // Arrays validation
  if (festival.teachers && !Array.isArray(festival.teachers)) return false;
  if (festival.musicians && !Array.isArray(festival.musicians)) return false;
  if (festival.prices && !Array.isArray(festival.prices)) return false;
  if (festival.tags && !Array.isArray(festival.tags)) return false;

  return true;
}