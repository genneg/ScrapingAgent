import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';
import { databaseService } from '@/lib/database-direct';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  source: string;
}

export interface AuditLogOptions {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export enum AuditAction {
  // Festival actions
  FESTIVAL_CREATED = 'festival_created',
  FESTIVAL_UPDATED = 'festival_updated',
  FESTIVAL_DELETED = 'festival_deleted',
  FESTIVAL_DUPLICATE_DETECTED = 'festival_duplicate_detected',

  // Scraping actions
  SCRAPING_STARTED = 'scraping_started',
  SCRAPING_COMPLETED = 'scraping_completed',
  SCRAPING_FAILED = 'scraping_failed',
  SCRAPING_RETRY = 'scraping_retry',

  // Validation actions
  VALIDATION_STARTED = 'validation_started',
  VALIDATION_COMPLETED = 'validation_completed',
  VALIDATION_FAILED = 'validation_failed',
  VALIDATION_AUTO_FIX = 'validation_auto_fix',

  // Database actions
  DATABASE_IMPORT_STARTED = 'database_import_started',
  DATABASE_IMPORT_COMPLETED = 'database_import_completed',
  DATABASE_IMPORT_FAILED = 'database_import_failed',
  DATABASE_TRANSACTION_ROLLED_BACK = 'database_transaction_rolled_back',

  // Geocoding actions
  GEOCODING_STARTED = 'geocoding_started',
  GEOCODING_COMPLETED = 'geocoding_completed',
  GEOCODING_FAILED = 'geocoding_failed',
  GEOCODING_CACHED = 'geocoding_cached',
}

export class AuditService {
  private readonly batchSize = 50;
  private logQueue: Array<{
    action: AuditAction;
    entityType: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    options: AuditLogOptions;
  }> = [];

  private flushTimeout?: NodeJS.Timeout;
  private readonly flushInterval = 5000; // 5 seconds

  constructor() {
    // Set up periodic flush
    this.setupPeriodicFlush();
  }

  async log(
    action: AuditAction,
    entityType: string,
    entityId?: string,
    oldValues?: any,
    newValues?: any,
    options: AuditLogOptions = {}
  ): Promise<void> {
    try {
      const entry = {
        action,
        entityType,
        entityId,
        oldValues,
        newValues,
        options,
      };

      // Add to queue
      this.logQueue.push(entry);

      // If queue is full, flush immediately
      if (this.logQueue.length >= this.batchSize) {
        await this.flush();
      } else {
        // Schedule flush if not already scheduled
        if (!this.flushTimeout) {
          this.flushTimeout = setTimeout(() => this.flush(), this.flushInterval);
        }
      }

      // Also log to standard logger for immediate visibility
      logger.info('Audit log entry', {
        action,
        entityType,
        entityId,
        hasOldValues: !!oldValues,
        hasNewValues: !!newValues,
        userId: options.userId,
      });

    } catch (error) {
      logger.error('Failed to queue audit log entry', {
        error: error instanceof Error ? error.message : 'Unknown error',
        action,
        entityType,
        entityId,
      });
    }
  }

  // Convenience methods for common actions
  async logScrapingStarted(url: string, options: AuditLogOptions = {}): Promise<void> {
    await this.log(
      AuditAction.SCRAPING_STARTED,
      'scraping_job',
      undefined,
      undefined,
      { url },
      options
    );
  }

  async logScrapingCompleted(
    url: string,
    result: { success: boolean; confidence?: number; festivalId?: string },
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.SCRAPING_COMPLETED,
      'scraping_job',
      result.festivalId,
      undefined,
      { url, ...result },
      options
    );
  }

  async logScrapingFailed(
    url: string,
    error: string,
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.SCRAPING_FAILED,
      'scraping_job',
      undefined,
      undefined,
      { url, error },
      options
    );
  }

  async logValidationStarted(
    festivalName: string,
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.VALIDATION_STARTED,
      'festival_validation',
      undefined,
      undefined,
      { festivalName },
      options
    );
  }

  async logValidationCompleted(
    festivalName: string,
    result: { isValid: boolean; confidence: number; errors: string[]; warnings: string[] },
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.VALIDATION_COMPLETED,
      'festival_validation',
      undefined,
      undefined,
      { festivalName, ...result },
      options
    );
  }

  async logDatabaseImportStarted(
    festivalName: string,
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.DATABASE_IMPORT_STARTED,
      'festival_import',
      undefined,
      undefined,
      { festivalName },
      options
    );
  }

  async logDatabaseImportCompleted(
    festivalId: string,
    result: { success: boolean; stats: any },
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.DATABASE_IMPORT_COMPLETED,
      'festival',
      festivalId,
      undefined,
      { ...result },
      options
    );
  }

  async logFestivalCreated(
    festivalId: string,
    festivalData: FestivalData,
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.FESTIVAL_CREATED,
      'festival',
      festivalId,
      undefined,
      { festivalData },
      options
    );
  }

  async logDuplicateDetected(
    festivalName: string,
    duplicates: any,
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.FESTIVAL_DUPLICATE_DETECTED,
      'festival',
      undefined,
      undefined,
      { festivalName, duplicates },
      options
    );
  }

  async logErrorRecovery(
    action: string,
    error: string,
    recoveryAction: string,
    success: boolean,
    options: AuditLogOptions = {}
  ): Promise<void> {
    await this.log(
      AuditAction.VALIDATION_AUTO_FIX,
      'error_recovery',
      undefined,
      { error },
      { action, recoveryAction, success },
      options
    );
  }

  private async flush(): Promise<void> {
    if (this.logQueue.length === 0) return;

    const entriesToFlush = [...this.logQueue];
    this.logQueue = [];

    // Clear any scheduled flush
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = undefined;
    }

    try {
      // Since we're using direct database connection, we'll implement a simpler logging approach
      // For now, just log to the standard logger
      logger.debug(`Audit log entries: ${entriesToFlush.length}`, {
        entries: entriesToFlush.map(entry => ({
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          timestamp: new Date().toISOString(),
        }))
      });

      // Note: In a production environment, you might want to implement
      // a proper audit log table and insert records here
      // For now, we're relying on the standard logger

    } catch (error) {
      logger.error('Failed to process audit log entries', {
        error: error instanceof Error ? error.message : 'Unknown error',
        entryCount: entriesToFlush.length,
      });

      // Re-queue entries on failure
      this.logQueue.unshift(...entriesToFlush);
    }
  }

  private setupPeriodicFlush(): void {
    // Handle graceful shutdown in Node.js environments
    if (typeof process !== 'undefined' && process.on) {
      const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, flushing audit logs...`);
        try {
          await this.flush();
          logger.info('Audit logs flushed successfully');
        } catch (error) {
          logger.error('Failed to flush audit logs during shutdown', { error });
        }
        process.exit(0);
      };

      // Handle common shutdown signals
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));

      // Handle uncaught exceptions (but don't prevent process exit)
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught exception', { error });
        this.flush().catch(flushError => {
          logger.error('Failed to flush audit logs on uncaught exception', { error: flushError });
        });
        process.exit(1);
      });

      // Handle unhandled promise rejections
      process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled rejection at', { promise, reason });
        this.flush().catch(flushError => {
          logger.error('Failed to flush audit logs on unhandled rejection', { error: flushError });
        });
        process.exit(1);
      });
    }
  }

  // Query methods for audit logs
  async getAuditLogs(filters: {
    userId?: string;
    action?: AuditAction;
    entityType?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<AuditLogEntry[]> {
    // Since we're not using Prisma, we'll return an empty array for now
    // In a production environment, you might want to implement
    // a proper audit log table and query it here
    logger.warn('Audit log querying not implemented in direct database mode', { filters });
    return [];
  }

  async getAuditStatistics(startDate: Date, endDate: Date): Promise<{
    totalActions: number;
    actionsByType: Record<AuditAction, number>;
    uniqueEntities: number;
    uniqueUsers: number;
  }> {
    // Since we're not using Prisma, we'll return default statistics
    // In a production environment, you might want to implement
    // a proper audit log table and query it here
    logger.warn('Audit log statistics not implemented in direct database mode', { startDate, endDate });

    const actionsByType = Object.values(AuditAction).reduce((acc, action) => {
      acc[action] = 0;
      return acc;
    }, {} as Record<AuditAction, number>);

    return {
      totalActions: 0,
      actionsByType,
      uniqueEntities: 0,
      uniqueUsers: 0,
    };
  }

  // Clean up old audit logs
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    // Since we're not using Prisma, we'll return 0
    // In a production environment, you might want to implement
    // a proper audit log table and clean it up here
    logger.warn('Audit log cleanup not implemented in direct database mode', { daysToKeep });
    return 0;
  }
}

export const auditService = new AuditService();