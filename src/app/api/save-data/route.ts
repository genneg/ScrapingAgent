import { NextRequest, NextResponse } from 'next/server';
import { SecurityUtils } from '@/lib/security-utils';
import { FestivalData } from '@/types';
import { directDb } from '@/lib/database-direct';

export async function POST(request: NextRequest) {
  try {
    const requestId = SecurityUtils.generateRequestId();
    const startTime = Date.now();

    console.log(`[${requestId}] Starting data save process`);
    // Database URL configured (removed for security)

    // Parse and validate request body
    const body = await request.json();
    const { data, confidence } = body;

    if (!data || !confidence) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Data and confidence are required'
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            duration: Date.now() - startTime
          }
        },
        { status: 400 }
      );
    }

    // Validate data structure
    if (!isValidFestivalData(data)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_DATA',
            message: 'Invalid festival data structure'
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            duration: Date.now() - startTime
          }
        },
        { status: 400 }
      );
    }

    // Normalize festival data
    const normalizedData = normalizeFestivalData(data);

    // Log detailed bio data before saving
    console.log(`[${requestId}] Bio data being saved to database:`, {
      teachers: normalizedData.teachers?.map(t => ({
        name: t.name,
        hasBio: !!t.bio,
        bioLength: t.bio?.length || 0,
        bioPreview: t.bio?.substring(0, 100) + (t.bio && t.bio.length > 100 ? '...' : '')
      })) || [],
      musicians: normalizedData.musicians?.map(m => ({
        name: m.name,
        hasBio: !!m.bio,
        bioLength: m.bio?.length || 0,
        bioPreview: m.bio?.substring(0, 100) + (m.bio && m.bio.length > 100 ? '...' : '')
      })) || []
    });

    // Use direct database service to save data
    const dbResult = await directDb.insertFestival(normalizedData);

    if (!dbResult.success) {
      console.error(`[${requestId}] Database insertion failed:`, dbResult.error);

      // Fallback: Return success with warning when database is unavailable
      // This allows the app to continue working without crashing
      const isConnectionError = dbResult.error?.includes?.('Database connection failed') ||
                               dbResult.error?.includes?.('Tenant or user not found') ||
                               dbResult.error?.includes?.('INSERT has more target columns than expressions');

      if (isConnectionError) {
        console.warn(`[${requestId}] Using fallback mode - database unavailable`);

        return NextResponse.json({
          success: true,
          data: {
            message: 'Data processed successfully (fallback mode)',
            warning: 'Database unavailable - data was not permanently saved',
            fallback: true,
            processedData: normalizedData
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            duration: Date.now() - startTime,
            mode: 'fallback',
            databaseError: dbResult.error
          }
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DATABASE_INSERTION_FAILED',
            message: 'Failed to insert festival data into database'
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            duration: Date.now() - startTime,
            details: dbResult.error
          }
        },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] Data saved successfully in ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      data: {
        message: 'Festival data saved successfully',
        details: dbResult.data
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        duration: Date.now() - startTime,
        confidence
      }
    });

  } catch (error) {
    const requestId = SecurityUtils.generateRequestId();
    console.error(`[${requestId}] Unexpected error in save-data route:`, error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while saving data',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId
        }
      },
      { status: 500 }
    );
  }
}

// Helper function to validate festival data structure
function isValidFestivalData(data: unknown): data is FestivalData {
  if (!data || typeof data !== 'object') return false;

  const festival = data as any; // Use any for flexible type checking

  // Required fields
  if (!festival.name || typeof festival.name !== 'string') return false;

  // Date validation - accept both Date objects and ISO strings
  if (!festival.startDate) return false;
  if (!(festival.startDate instanceof Date) && typeof festival.startDate !== 'string') return false;
  if (typeof festival.startDate === 'string' && isNaN(new Date(festival.startDate).getTime())) return false;

  if (!festival.endDate) return false;
  if (!(festival.endDate instanceof Date) && typeof festival.endDate !== 'string') return false;
  if (typeof festival.endDate === 'string' && isNaN(new Date(festival.endDate).getTime())) return false;

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

// Helper function to normalize festival data and convert strings to Date objects
function normalizeFestivalData(data: any): FestivalData {
  const normalized = { ...data };

  // Convert date strings to Date objects
  if (typeof normalized.startDate === 'string') {
    normalized.startDate = new Date(normalized.startDate);
  }
  if (typeof normalized.endDate === 'string') {
    normalized.endDate = new Date(normalized.endDate);
  }
  if (typeof normalized.registrationDeadline === 'string') {
    normalized.registrationDeadline = new Date(normalized.registrationDeadline);
  }

  // Convert price deadline dates
  if (normalized.prices && Array.isArray(normalized.prices)) {
    normalized.prices = normalized.prices.map((price: any) => ({
      ...price,
      deadline: typeof price.deadline === 'string' ? new Date(price.deadline) : price.deadline
    }));
  }

  return normalized as FestivalData;
}