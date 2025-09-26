import configService from './config';
import { logger } from './logger';
import { databaseService } from './database-direct';

/**
 * Application initialization utilities
 */
export class AppInitializer {
  private static isInitialized = false;

  /**
   * Initialize the entire application
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Application already initialized');
      return;
    }

    try {
      logger.info('Starting application initialization');

      // Step 1: Initialize and validate configuration
      this.initializeConfiguration();

      // Step 2: Validate environment-specific requirements
      this.validateEnvironment();

      // Step 3: Initialize database connections (if needed)
      await this.initializeDatabase();

      // Step 4: Initialize external service connections (if needed)
      await this.initializeExternalServices();

      this.isInitialized = true;

      logger.info('Application initialization completed successfully');

    } catch (error) {
      logger.error('Application initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // In production, we might want to exit the process
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }

      throw error;
    }
  }

  /**
   * Initialize configuration
   */
  private static initializeConfiguration(): void {
    logger.info('Initializing configuration');

    const config = configService.getAll();

    // Log critical configuration values for debugging
    const appConfig = configService.getAll();
    logger.info('Configuration loaded', {
      nodeEnv: appConfig.nodeEnv,
      logLevel: appConfig.logLevel,
      hasDatabaseConfig: !!appConfig.databaseUrl,
      hasAnthropicKey: !!appConfig.anthropicApiKey,
      hasGoogleMapsKey: !!appConfig.googleMapsApiKey,
    });

    // Warn about development configuration in production
    if (appConfig.nodeEnv === 'production') {
      this.checkProductionSecurity();
    }
  }

  /**
   * Validate environment-specific requirements
   */
  private static validateEnvironment(): void {
    const config = configService.getAll();

    switch (config.nodeEnv) {
      case 'production':
        this.validateProductionEnvironment();
        break;
      case 'development':
        this.validateDevelopmentEnvironment();
        break;
      case 'test':
        this.validateTestEnvironment();
        break;
    }
  }

  /**
   * Validate production environment requirements
   */
  private static validateProductionEnvironment(): void {
    logger.info('Validating production environment requirements');

    const config = configService.getAll();

    const issues: string[] = [];

    // Check for required API keys
    if (!config.anthropicApiKey) {
      issues.push('ANTHROPIC_API_KEY is required for production');
    }

    if (!config.googleMapsApiKey) {
      issues.push('GOOGLE_MAPS_API_KEY is recommended for production');
    }

    if (issues.length > 0) {
      logger.warn('Production environment validation issues', { issues });
    }
  }

  /**
   * Validate development environment requirements
   */
  private static validateDevelopmentEnvironment(): void {
    logger.info('Validating development environment requirements');

    const config = configService.getAll();

    // Check for required API keys in development
    if (!config.anthropicApiKey) {
      logger.warn('ANTHROPIC_API_KEY not configured - scraping will not work');
    }

    if (!config.databaseUrl) {
      logger.warn('DATABASE_URL not configured - database features will not work');
    }
  }

  /**
   * Validate test environment requirements
   */
  private static validateTestEnvironment(): void {
    logger.info('Validating test environment requirements');

    // Test environment typically has minimal requirements
    // but we should ensure it's clearly marked as test
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('Running in test mode but NODE_ENV is not set to "test"');
    }
  }

  /**
   * Check production security settings
   */
  private static checkProductionSecurity(): void {
    const config = configService.getAll();
    const securityIssues: string[] = [];

    // Check for debug logging in production
    if (config.logLevel === 'debug') {
      securityIssues.push('Debug logging enabled in production - may expose sensitive information');
    }

    if (securityIssues.length > 0) {
      logger.error('Production security issues detected', { securityIssues });
    }
  }

  /**
   * Initialize database connections
   */
  private static async initializeDatabase(): Promise<void> {
    logger.info('Initializing database connections');

    // For now, we'll just validate that we can connect
    // In a real application, you might want to:
    // - Test the connection
    // - Run migrations
    // - Seed initial data
    // - Set up connection pooling

    try {
      // Test basic database connectivity using direct connection
      await databaseService.testConnection();

      logger.info('Database connection verified');
    } catch (error) {
      throw new Error(`Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Initialize external service connections
   */
  private static async initializeExternalServices(): Promise<void> {
    logger.info('Initializing external service connections');

    const config = configService.getAll();

    // Validate Anthropic API key format
    if (config.anthropicApiKey && !config.anthropicApiKey.startsWith('sk-ant-')) {
      logger.warn('ANTHROPIC_API_KEY does not appear to be in the correct format');
    }

    // Test Google Maps API if configured
    if (config.googleMapsApiKey) {
      try {
        // Simple validation - in a real app you might make a test API call
        if (!config.googleMapsApiKey.startsWith('AIza')) {
          logger.warn('GOOGLE_MAPS_API_KEY does not appear to be in the correct format');
        }
      } catch (error) {
        logger.warn('Google Maps API key validation failed', { error });
      }
    }

    logger.info('External service connections initialized');
  }

  /**
   * Check if application is initialized
   */
  static isAppInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get initialization status
   */
  static getStatus(): {
    initialized: boolean;
    configValid: boolean;
    environment: string;
    issues?: string[];
  } {
    const config = configService.getAll();

    return {
      initialized: this.isInitialized,
      configValid: true, // Simplified validation
      environment: config.nodeEnv,
      issues: [],
    };
  }
}

/**
 * Initialize the application (exported for convenience)
 */
export async function initializeApp(): Promise<void> {
  await AppInitializer.initialize();
}

/**
 * Get application initialization status
 */
export function getAppStatus() {
  return AppInitializer.getStatus();
}