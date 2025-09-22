import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DatabaseService } from '@/services/database';
import { SecurityUtils } from '@/lib/security-utils';
import { FestivalData } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const requestId = SecurityUtils.generateRequestId();
    const startTime = Date.now();

    console.log(`[${requestId}] Starting data save process`);

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

    // Initialize database service
    const dbService = new DatabaseService(prisma);

    // Import the data
    const result = await dbService.importFestivalData(data, {
      geocodeVenue: true,
      skipDuplicates: false
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'IMPORT_FAILED',
            message: result.errors.length > 0 ? result.errors[0] : 'Failed to import data',
            details: { errors: result.errors, warnings: result.warnings }
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
            duration: Date.now() - startTime
          }
        },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] Data saved successfully in ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      data: {
        festivalId: result.festivalId,
        stats: result.stats
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

  const festival = data as FestivalData;

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