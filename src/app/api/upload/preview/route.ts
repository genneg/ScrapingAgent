import { NextRequest, NextResponse } from 'next/server';
import { UploadService } from '@/lib/upload';
import { createLogger } from '@/lib/logger';

const logger = createLogger('upload-preview-api');

export async function POST(request: NextRequest) {
  try {
    logger.info('Received preview request');

    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request body must be a JSON object',
          },
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const result = await UploadService.previewData(body);

    if (!result.success) {
      logger.warn('Preview failed', { error: result.error });
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    logger.info('Preview successful');
    return NextResponse.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Unexpected error in preview endpoint', { error });
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}