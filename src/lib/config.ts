/**
 * Configuration service for the application
 * Handles environment variables and app configuration
 */

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  directUrl: string;
  anthropicApiKey: string;
  anthropicModel: string;
  googleMapsApiKey: string;
  nextAuthSecret?: string;
  nextAuthUrl?: string;
  logLevel: string;
  maxConcurrentScraps: number;
  scrapingTimeout: number;
  confidenceThreshold: number;
}

class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3000'),
      databaseUrl: process.env.DATABASE_URL || '',
      directUrl: process.env.DIRECT_URL || '',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
      anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
      nextAuthSecret: process.env.NEXTAUTH_SECRET,
      nextAuthUrl: process.env.NEXTAUTH_URL,
      logLevel: process.env.LOG_LEVEL || 'info',
      maxConcurrentScraps: parseInt(process.env.MAX_CONCURRENT_SCRAPES || '3'),
      scrapingTimeout: parseInt(process.env.SCRAPING_TIMEOUT || '120000'),
      confidenceThreshold: parseFloat(process.env.SCRAPING_CONFIDENCE_THRESHOLD || '0.85'),
    };
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  public getAll(): AppConfig {
    return { ...this.config };
  }

  public isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.databaseUrl) {
      errors.push('DATABASE_URL is required');
    }

    if (!this.config.directUrl) {
      errors.push('DIRECT_URL is required');
    }

    if (!this.config.anthropicApiKey) {
      errors.push('ANTHROPIC_API_KEY is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const configService = new ConfigService();

// Export default for convenience
export default configService;