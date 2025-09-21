import { NextRequest, NextResponse } from 'next/server';
import { UploadService } from '@/lib/upload';
import { createLogger } from '@/lib/logger';
import { authenticateRequest, requireAuth } from '@/lib/auth';

const logger = createLogger('upload-api');

const handleUpload = requireAuth(['write'])(async (request: NextRequest, context) => {
  logger.info('Received authenticated upload request', { userId: context.user.id });

  const result = await UploadService.handleUpload(request);

  if (!result.success) {
    logger.warn('Upload failed', { error: result.error, userId: context.user.id });
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        timestamp: new Date().toISOString(),
      },
      { status: 400 }
    );
  }

  logger.info('Upload successful', { userId: context.user.id });
  return NextResponse.json({
    success: true,
    data: result.data,
    sessionId: context.sessionId,
    timestamp: new Date().toISOString(),
  });
});

export async function POST(request: NextRequest) {
  return handleUpload(request);
}

export async function GET() {
  return NextResponse.json({
    message: 'Upload endpoint is ready',
    endpoints: {
      upload: 'POST /api/upload - Upload JSON festival data',
      preview: 'POST /api/upload/preview - Preview festival data without importing',
    },
    supportedFormats: ['application/json'],
    maxFileSize: '5MB',
  });
}