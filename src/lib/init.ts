import { initializeConfig, configService } from './config';
import { logger } from './logger';

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

    const config = initializeConfig();

    // Log critical configuration values for debugging
    const appConfig = configService.getAppConfig();
    logger.info('Configuration loaded', {
      environment: appConfig.environment,
      logLevel: appConfig.logLevel,
      hasDatabaseConfig: !!config.database.url,
      hasAnthropicKey: !!config.apis.anthropic.apiKey,
      hasGoogleMapsKey: !!config.apis.googleMaps?.apiKey,
      rateLimits: config.security.rateLimits,
    });

    // Warn about development configuration in production
    if (appConfig.environment === 'production') {
      this.checkProductionSecurity();
    }
  }

  /**
   * Validate environment-specific requirements
   */
  private static validateEnvironment(): void {
    const config = configService.getConfig();

    switch (config.app.environment) {
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

    const config = configService.getConfig();

    const issues: string[] = [];

    // Check for required security configurations
    if (config.auth.jwtSecret.length < 64) {
      issues.push('JWT_SECRET should be at least 64 characters in production');
    }

    if (!config.apis.googleMaps?.apiKey) {
      issues.push('GOOGLE_MAPS_API_KEY is recommended for production');
    }

    // Check for demo accounts in production
    if (config.auth.demoUser || config.auth.adminUser) {
      issues.push('Demo/admin accounts should not be enabled in production');
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

    const config = configService.getConfig();

    // Ensure we have demo accounts for development
    if (!config.auth.demoUser) {
      logger.info('DEMO_USER credentials not configured - demo login will not work');
    }

    if (!config.auth.adminUser) {
      logger.info('ADMIN_USER credentials not configured - admin login will not work');
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
    const config = configService.getConfig();
    const securityIssues: string[] = [];

    // Check for default or weak secrets
    if (config.auth.jwtSecret.includes('your-super-secret') ||
        config.auth.jwtSecret.length < 32) {
      securityIssues.push('JWT_SECRET appears to be weak or using default value');
    }

    // Check for insecure logging
    if (config.app.logLevel === 'debug') {
      securityIssues.push('Debug logging enabled in production - may expose sensitive information');
    }

    // Check for allowed scraping domains
    if (!config.security.allowedScrapingDomains ||
        config.security.allowedScrapingDomains.length === 0) {
      securityIssues.push('No allowed scraping domains configured - may allow scraping any domain');
    }

    if (securityIssues.length > 0) {
      logger.error('Production security issues detected', { securityIssues });

      // In a real production environment, you might want to:
      // 1. Send alerts to monitoring systems
      // 2. Block certain operations
      // 3. Log to security monitoring systems
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
      const { prisma } = await import('@/lib/prisma');

      // Test basic database connectivity
      await prisma.$queryRaw`SELECT 1`;

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

    const config = configService.getConfig();

    // Validate Anthropic API key format
    if (!config.apis.anthropic.apiKey.startsWith('sk-ant-')) {
      logger.warn('ANTHROPIC_API_KEY does not appear to be in the correct format');
    }

    // Test Google Maps API if configured
    if (config.apis.googleMaps?.apiKey) {
      try {
        // Simple validation - in a real app you might make a test API call
        if (!config.apis.googleMaps.apiKey.startsWith('AIza')) {
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
    const configValidation = configService.validate();

    return {
      initialized: this.isInitialized,
      configValid: configValidation.valid,
      environment: configService.getConfig().app.environment,
      issues: configValidation.valid ? undefined : configValidation.errors,
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