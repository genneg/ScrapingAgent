import { z } from 'zod';
import { ValidationError, ConfigurationError } from '@/lib/errors';
import { logger } from '@/lib/logger';

// Environment variable validation schema
const envSchema = z.object({
  // Database Configuration
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),

  // External API Keys
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  DEMO_USER_EMAIL: z.string().email('Invalid DEMO_USER_EMAIL format').optional(),
  DEMO_USER_PASSWORD: z.string().min(8, 'DEMO_USER_PASSWORD must be at least 8 characters').optional(),
  ADMIN_USER_EMAIL: z.string().email('Invalid ADMIN_USER_EMAIL format').optional(),
  ADMIN_USER_PASSWORD: z.string().min(8, 'ADMIN_USER_PASSWORD must be at least 8 characters').optional(),

  // Security Configuration
  ALLOWED_SCRAPING_DOMAINS: z.string().optional(),
  MAX_SCRAPING_REQUESTS_PER_MINUTE: z.string().regex(/^\d+$/, 'MAX_SCRAPING_REQUESTS_PER_MINUTE must be a number').optional(),
  MAX_UPLOAD_REQUESTS_PER_MINUTE: z.string().regex(/^\d+$/, 'MAX_UPLOAD_REQUESTS_PER_MINUTE must be a number').optional(),
  MAX_LOGIN_ATTEMPTS_PER_MINUTE: z.string().regex(/^\d+$/, 'MAX_LOGIN_ATTEMPTS_PER_MINUTE must be a number').optional(),
  MAX_API_REQUESTS_PER_MINUTE: z.string().regex(/^\d+$/, 'MAX_API_REQUESTS_PER_MINUTE must be a number').optional(),

  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url('Invalid NEXT_PUBLIC_APP_URL format').optional(),

  // Optional Configuration
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MAX_CONCURRENT_SCRAPES: z.string().regex(/^\d+$/, 'MAX_CONCURRENT_SCRAPES must be a number').optional(),
  SCRAPING_TIMEOUT: z.string().regex(/^\d+$/, 'SCRAPING_TIMEOUT must be a number').optional(),
});

// Configuration interface
export interface AppConfig {
  database: {
    url: string;
    directUrl: string;
  };
  apis: {
    anthropic: {
      apiKey: string;
    };
    googleMaps?: {
      apiKey: string;
    };
  };
  auth: {
    jwtSecret: string;
    demoUser?: {
      email: string;
      password: string;
    };
    adminUser?: {
      email: string;
      password: string;
    };
  };
  security: {
    allowedScrapingDomains?: string[];
    rateLimits: {
      scraping: number;
      upload: number;
      login: number;
      api: number;
    };
  };
  app: {
    environment: 'development' | 'production' | 'test';
    appUrl?: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    maxConcurrentScrapes?: number;
    scrapingTimeout?: number;
  };
}

// Parse and validate configuration
function parseConfig(): AppConfig {
  try {
    const rawEnv = {
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
      JWT_SECRET: process.env.JWT_SECRET,
      DEMO_USER_EMAIL: process.env.DEMO_USER_EMAIL,
      DEMO_USER_PASSWORD: process.env.DEMO_USER_PASSWORD,
      ADMIN_USER_EMAIL: process.env.ADMIN_USER_EMAIL,
      ADMIN_USER_PASSWORD: process.env.ADMIN_USER_PASSWORD,
      ALLOWED_SCRAPING_DOMAINS: process.env.ALLOWED_SCRAPING_DOMAINS,
      MAX_SCRAPING_REQUESTS_PER_MINUTE: process.env.MAX_SCRAPING_REQUESTS_PER_MINUTE,
      MAX_UPLOAD_REQUESTS_PER_MINUTE: process.env.MAX_UPLOAD_REQUESTS_PER_MINUTE,
      MAX_LOGIN_ATTEMPTS_PER_MINUTE: process.env.MAX_LOGIN_ATTEMPTS_PER_MINUTE,
      MAX_API_REQUESTS_PER_MINUTE: process.env.MAX_API_REQUESTS_PER_MINUTE,
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      LOG_LEVEL: process.env.LOG_LEVEL,
      MAX_CONCURRENT_SCRAPES: process.env.MAX_CONCURRENT_SCRAPES,
      SCRAPING_TIMEOUT: process.env.SCRAPING_TIMEOUT,
    };

    // Validate environment variables
    const validatedEnv = envSchema.parse(rawEnv);

    // Transform into application configuration
    const config: AppConfig = {
      database: {
        url: validatedEnv.DATABASE_URL,
        directUrl: validatedEnv.DIRECT_URL,
      },
      apis: {
        anthropic: {
          apiKey: validatedEnv.ANTHROPIC_API_KEY,
        },
        ...(validatedEnv.GOOGLE_MAPS_API_KEY && {
          googleMaps: {
            apiKey: validatedEnv.GOOGLE_MAPS_API_KEY,
          },
        }),
      },
      auth: {
        jwtSecret: validatedEnv.JWT_SECRET,
        ...(validatedEnv.DEMO_USER_EMAIL && validatedEnv.DEMO_USER_PASSWORD && {
          demoUser: {
            email: validatedEnv.DEMO_USER_EMAIL,
            password: validatedEnv.DEMO_USER_PASSWORD,
          },
        }),
        ...(validatedEnv.ADMIN_USER_EMAIL && validatedEnv.ADMIN_USER_PASSWORD && {
          adminUser: {
            email: validatedEnv.ADMIN_USER_EMAIL,
            password: validatedEnv.ADMIN_USER_PASSWORD,
          },
        }),
      },
      security: {
        ...(validatedEnv.ALLOWED_SCRAPING_DOMAINS && {
          allowedScrapingDomains: validatedEnv.ALLOWED_SCRAPING_DOMAINS
            .split(',')
            .map(domain => domain.trim())
            .filter(domain => domain.length > 0),
        }),
        rateLimits: {
          scraping: parseInt(validatedEnv.MAX_SCRAPING_REQUESTS_PER_MINUTE || '10'),
          upload: parseInt(validatedEnv.MAX_UPLOAD_REQUESTS_PER_MINUTE || '5'),
          login: parseInt(validatedEnv.MAX_LOGIN_ATTEMPTS_PER_MINUTE || '3'),
          api: parseInt(validatedEnv.MAX_API_REQUESTS_PER_MINUTE || '100'),
        },
      },
      app: {
        environment: validatedEnv.NODE_ENV,
        ...(validatedEnv.NEXT_PUBLIC_APP_URL && {
          appUrl: validatedEnv.NEXT_PUBLIC_APP_URL,
        }),
        logLevel: validatedEnv.LOG_LEVEL,
        ...(validatedEnv.MAX_CONCURRENT_SCRAPES && {
          maxConcurrentScrapes: parseInt(validatedEnv.MAX_CONCURRENT_SCRAPES),
        }),
        ...(validatedEnv.SCRAPING_TIMEOUT && {
          scrapingTimeout: parseInt(validatedEnv.SCRAPING_TIMEOUT),
        }),
      },
    };

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues
        .filter(issue => issue.code === 'invalid_type')
        .map(issue => issue.path.join('.'))
        .filter(path => !path.includes('optional'));

      const invalidVars = error.issues
        .filter(issue =>
          ['invalid_string', 'invalid_enum', 'invalid_format', 'invalid_literal'].includes(issue.code)
        )
        .map(issue => issue.path.join('.'));

      throw new ConfigurationError(
        `Configuration validation failed. Missing: ${missingVars.join(', ')}. Invalid: ${invalidVars.join(', ')}`,
        {
          details: {
            missing: missingVars,
            invalid: invalidVars,
            errors: error.issues,
          },
        }
      );
    }

    throw new ConfigurationError(
      'Failed to parse configuration',
      { cause: error instanceof Error ? error : undefined }
    );
  }
}

// Configuration validation utilities
export class ConfigService {
  private static instance: ConfigService;
  private config!: AppConfig;
  private isInitialized = false;

  private constructor() {
    // Private constructor to enforce singleton pattern
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Initialize and validate configuration
   */
  initialize(): AppConfig {
    if (this.isInitialized) {
      logger.warn('Configuration already initialized');
      return this.config;
    }

    try {
      logger.info('Initializing application configuration');

      this.config = parseConfig();

      // Log configuration summary (without sensitive data)
      this.logConfigSummary();

      this.isInitialized = true;

      logger.info('Configuration initialized successfully');
      return this.config;
    } catch (error) {
      logger.error('Failed to initialize configuration', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof ConfigurationError) {
        throw error;
      }

      throw new ConfigurationError(
        'Configuration initialization failed',
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    if (!this.isInitialized) {
      throw new ConfigurationError('Configuration not initialized. Call initialize() first.');
    }
    return this.config;
  }

  /**
   * Check if configuration is valid
   */
  validate(): { valid: boolean; errors: string[] } {
    try {
      parseConfig();
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        return {
          valid: false,
          errors: [error.message],
        };
      }
      return {
        valid: false,
        errors: ['Unknown configuration error'],
      };
    }
  }

  /**
   * Get configuration for specific module
   */
  getDatabaseConfig() {
    return this.getConfig().database;
  }

  getApiConfig() {
    return this.getConfig().apis;
  }

  getAuthConfig() {
    return this.getConfig().auth;
  }

  getSecurityConfig() {
    return this.getConfig().security;
  }

  getAppConfig() {
    return this.getConfig().app;
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.getConfig().app.environment === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.getConfig().app.environment === 'development';
  }

  /**
   * Check if running in test
   */
  isTest(): boolean {
    return this.getConfig().app.environment === 'test';
  }

  /**
   * Log configuration summary (without sensitive data)
   */
  private logConfigSummary(): void {
    const { app, security, database } = this.config;

    logger.info('Configuration Summary', {
      environment: app.environment,
      logLevel: app.logLevel,
      databaseConfigured: !!database.url,
      scrapingDomains: security.allowedScrapingDomains?.length || 0,
      rateLimits: security.rateLimits,
      maxConcurrentScrapes: app.maxConcurrentScrapes,
      scrapingTimeout: app.scrapingTimeout,
      demoUserConfigured: !!this.config.auth.demoUser,
      adminUserConfigured: !!this.config.auth.adminUser,
    });
  }

  /**
   * Reset configuration (mainly for testing)
   */
  reset(): void {
    this.isInitialized = false;
    this.config = {} as AppConfig;
  }
}

// Export singleton instance
export const configService = ConfigService.getInstance();

// Export convenience function for initialization
export function initializeConfig(): AppConfig {
  return configService.initialize();
}