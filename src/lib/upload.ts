import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from './logger';
import { festivalSchema } from '@/validations';
import { Result } from '@/types';

const logger = createLogger('upload');

// Configure multer for memory storage
export const config = {
  api: {
    bodyParser: false,
  },
};

export class UploadService {
  /**
   * Handle JSON file upload and validation
   */
  static async handleUpload(request: NextRequest): Promise<Result<any>> {
    try {
      logger.info('Processing file upload request');

      // Parse multipart form data
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        logger.warn('No file provided in upload request');
        return {
          success: false,
          error: {
            code: 'NO_FILE',
            message: 'No file provided',
          },
        };
      }

      // Validate file type
      if (!file.name.endsWith('.json')) {
        logger.warn(`Invalid file type: ${file.name}`);
        return {
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only JSON files are accepted',
          },
        };
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        logger.warn(`File too large: ${file.size} bytes`);
        return {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'File size must be less than 5MB',
          },
        };
      }

      logger.info(`Processing file: ${file.name} (${file.size} bytes)`);

      // Parse JSON content
      const content = await file.text();
      let jsonData;

      try {
        jsonData = JSON.parse(content);
      } catch (parseError) {
        logger.error('Failed to parse JSON', { error: parseError });
        return {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON format',
            details: parseError instanceof Error ? parseError.message : 'Parse error',
          },
        };
      }

      // Validate against schema
      const validationResult = festivalSchema.safeParse(jsonData);

      if (!validationResult.success) {
        logger.warn('Schema validation failed', { errors: validationResult.error.issues });
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Data validation failed',
            details: validationResult.error.issues,
          },
        };
      }

      const validatedData = validationResult.data;
      logger.info('File upload and validation successful', {
        festival: validatedData.name,
        artistsCount: validatedData.artists?.length || 0,
        workshopsCount: validatedData.workshops?.length || 0,
      });

      return {
        success: true,
        data: {
          message: 'File uploaded and validated successfully',
          data: validatedData,
          meta: {
            filename: file.name,
            size: file.size,
            uploadedAt: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      logger.error('Unexpected error during upload', { error });
      return {
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: 'Failed to process file upload',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Handle festival data preview
   */
  static async previewData(data: any): Promise<Result<any>> {
    try {
      const validationResult = festivalSchema.safeParse(data);

      if (!validationResult.success) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Data validation failed',
            details: validationResult.error.issues,
          },
        };
      }

      const validatedData = validationResult.data;

      // Create a preview summary
      const preview = {
        festival: {
          name: validatedData.name,
          dates: `${validatedData.startDate.toISOString().split('T')[0]} - ${validatedData.endDate.toISOString().split('T')[0]}`,
          location: validatedData.location?.city || 'Unknown',
        },
        summary: {
          artists: validatedData.artists?.length || 0,
          workshops: validatedData.workshops?.length || 0,
          socialEvents: validatedData.socialEvents?.length || 0,
        },
        validation: {
          status: 'valid',
          confidence: 1.0,
          warnings: [],
        },
      };

      return {
        success: true,
        data: preview,
      };
    } catch (error) {
      logger.error('Error previewing data', { error });
      return {
        success: false,
        error: {
          code: 'PREVIEW_ERROR',
          message: 'Failed to preview data',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}