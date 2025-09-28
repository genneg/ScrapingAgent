import { anthropic } from '@/lib/anthropic';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';
import { ValidationError, ExternalServiceError } from '@/lib/errors';
import { websocketService, ScrapingProgress } from '@/lib/websocket';
import { performanceService } from '@/services/performance';
import configService from '@/lib/config';
import { buildPrimaryPrompt, buildRetryPrompt, buildMinimalPrompt } from '@/services/scraping-prompts';
import { extractJsonBlock, parseWithRepair } from '@/utils/json-parser';

// Type definitions for raw festival data from AI
interface RawFestivalData {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  registrationDeadline?: string;
  venue?: RawVenueData;
  venues?: RawVenueData[];
  website?: string;
  facebook?: string;
  instagram?: string;
  email?: string;
  phone?: string;
  registrationUrl?: string;
  teachers?: RawTeacherData[];
  musicians?: RawMusicianData[];
  prices?: RawPriceData[];
  tags?: string[];
  confidence?: number;
  [key: string]: unknown; // Index signature for dynamic access
}

interface RawVenueData {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

interface RawTeacherData {
  name: string;
  bio?: string;
  specializations?: string[];
}

interface RawMusicianData {
  name: string;
  bio?: string;
  genre?: string[];
}

interface RawPriceData {
  type: string;
  amount: number;
  currency: string;
  deadline?: string;
  description?: string;
}


export interface ScrapingResult {
  success: boolean;
  data?: FestivalData;
  confidence: number;
  error?: string;
  metadata: {
    url: string;
    timestamp: string;
    processingTime: number;
    pagesExplored: number;
  };
}

export interface MultiScrapingResult {
  success: boolean;
  results: ScrapingResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    confidence: number;
    processingTime: number;
  };
  metadata: {
    urls: string[];
    timestamp: string;
    processingTime: number;
    concurrency: number;
  };
}

export interface MultiScrapingOptions {
  concurrency?: number;
  timeoutPerUrl?: number;
  continueOnError?: boolean;
}

export interface UrlValidationResult {
  valid: boolean;
  sanitized: string;
  error?: string;
  domain?: string;
}

export class ScrapingService {
  private readonly CONFIDENCE_THRESHOLD: number;
  private readonly MAX_PAGES: number;
  private readonly TIMEOUT: number;
  private readonly MAX_URLS_PER_BATCH: number;
  private readonly DEFAULT_CONCURRENCY: number;

  constructor() {
    this.CONFIDENCE_THRESHOLD = parseFloat(process.env.SCRAPING_CONFIDENCE_THRESHOLD || '0.85');
    this.MAX_PAGES = parseInt(process.env.SCRAPING_MAX_PAGES || '15');
    this.TIMEOUT = parseInt(process.env.SCRAPING_TIMEOUT || '30000');
    this.MAX_URLS_PER_BATCH = parseInt(process.env.MAX_URLS_PER_BATCH || '20');
    this.DEFAULT_CONCURRENCY = parseInt(process.env.DEFAULT_CONCURRENCY || '3');
  }

  private validateMultipleUrls(urls: string[]): UrlValidationResult[] {
    return urls.map(url => this.validateSingleUrl(url));
  }

  private validateSingleUrl(url: string): UrlValidationResult {
    try {
      // Basic URL format validation
      let sanitized = url.trim();

      // Add protocol if missing
      if (!sanitized.match(/^https?:\/\//)) {
        sanitized = `https://${sanitized}`;
      }

      const urlObj = new URL(sanitized);

      // Security validation - block localhost and private IPs
      const hostname = urlObj.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
        return {
          valid: false,
          sanitized: '',
          error: 'Invalid hostname: localhost and private IPs are not allowed'
        };
      }

      // Ensure it's HTTP/HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return {
          valid: false,
          sanitized: '',
          error: 'Only HTTP and HTTPS protocols are supported'
        };
      }

      return {
        valid: true,
        sanitized: sanitized,
        domain: hostname
      };
    } catch (error) {
      return {
        valid: false,
        sanitized: '',
        error: `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private groupUrlsByDomain(urls: string[]): Map<string, string[]> {
    const domainGroups = new Map<string, string[]>();

    urls.forEach(url => {
      const validation = this.validateSingleUrl(url);
      if (validation.valid && validation.domain) {
        if (!domainGroups.has(validation.domain)) {
          domainGroups.set(validation.domain, []);
        }
        domainGroups.get(validation.domain)!.push(validation.sanitized);
      }
    });

    return domainGroups;
  }

  private async processUrlBatch(
    urls: string[],
    concurrency: number,
    sessionId?: string,
    options?: MultiScrapingOptions
  ): Promise<ScrapingResult[]> {
    const results: ScrapingResult[] = [];

    // Process URLs in batches to respect concurrency limits
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchPromises = batch.map(async (url, index) => {
        const globalIndex = i + index;

        // Send progress update for current URL
        if (sessionId) {
          this.sendBatchProgressUpdate(sessionId, {
            stage: 'scraping',
            currentUrl: url,
            currentUrlIndex: globalIndex,
            totalUrls: urls.length,
            completedUrls: results.length,
            failedUrls: results.filter(r => !r.success).length,
            results: []
          });
        }

        try {
          const timeout = options?.timeoutPerUrl || this.TIMEOUT;
          const result = await Promise.race([
            this.scrapeFestivalUrl(url, sessionId),
            new Promise<ScrapingResult>((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout)
            )
          ]);

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn(`Failed to scrape URL: ${url}`, { error: errorMessage });

          return {
            success: false,
            confidence: 0,
            error: errorMessage,
            metadata: {
              url,
              timestamp: new Date().toISOString(),
              processingTime: 0,
              pagesExplored: 0
            }
          };
        }
      });

      // Wait for current batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach(settledResult => {
        if (settledResult.status === 'fulfilled') {
          results.push(settledResult.value);
        } else {
          // Handle rejected promises
          const error = settledResult.reason;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('URL processing failed', { error: errorMessage });

          results.push({
            success: false,
            confidence: 0,
            error: errorMessage,
            metadata: {
              url: 'unknown',
              timestamp: new Date().toISOString(),
              processingTime: 0,
              pagesExplored: 0
            }
          });
        }
      });

      // Small delay between batches to be respectful
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  private sendBatchProgressUpdate(sessionId: string, progress: any) {
    try {
      const batchProgress = {
        type: 'batch-scraping' as const,
        timestamp: new Date().toISOString(),
        sessionId,
        ...progress
      };

      websocketService.sendScrapingProgress(sessionId, batchProgress);
    } catch (error) {
      logger.warn('Failed to send batch WebSocket progress update', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async scrapeMultipleUrls(urls: string[], sessionId?: string, options?: MultiScrapingOptions): Promise<MultiScrapingResult> {
    const startTime = Date.now();
    const timer = performanceService.createTimer('scrape_multiple_urls');
    timer.start();

    try {
      // Send initial progress update
      if (sessionId) {
        this.sendBatchProgressUpdate(sessionId, {
          stage: 'validating',
          currentUrlIndex: 0,
          totalUrls: urls.length,
          completedUrls: 0,
          failedUrls: 0,
          results: []
        });
      }

      // Validate all URLs first
      const validations = this.validateMultipleUrls(urls);
      const validUrls = validations
        .filter(v => v.valid)
        .map(v => v.sanitized);

      const invalidUrls = validations.filter(v => !v.valid);

      // Log validation results
      if (invalidUrls.length > 0) {
        logger.warn('Some URLs failed validation', {
          totalUrls: urls.length,
          validUrls: validUrls.length,
          invalidUrls: invalidUrls.map(v => ({ url: v.sanitized, error: v.error }))
        });
      }

      // Check if we have any valid URLs
      if (validUrls.length === 0) {
        const error = 'No valid URLs provided';
        logger.error('URL validation failed', { error, validations });

        return {
          success: false,
          results: [],
          summary: {
            total: urls.length,
            successful: 0,
            failed: urls.length,
            confidence: 0,
            processingTime: Date.now() - startTime
          },
          metadata: {
            urls,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
            concurrency: options?.concurrency || this.DEFAULT_CONCURRENCY
          }
        };
      }

      // Check URL limit
      if (validUrls.length > this.MAX_URLS_PER_BATCH) {
        logger.warn(`URL count exceeds maximum limit`, {
          urlCount: validUrls.length,
          maxLimit: this.MAX_URLS_PER_BATCH
        });

        return {
          success: false,
          results: [],
          summary: {
            total: urls.length,
            successful: 0,
            failed: urls.length,
            confidence: 0,
            processingTime: Date.now() - startTime
          },
          metadata: {
            urls,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime,
            concurrency: options?.concurrency || this.DEFAULT_CONCURRENCY
          }
        };
      }

      // Remove duplicates while preserving order
      const uniqueUrls = [...new Set(validUrls)];

      if (uniqueUrls.length < validUrls.length) {
        logger.info('Removed duplicate URLs', {
          originalCount: validUrls.length,
          uniqueCount: uniqueUrls.length
        });
      }

      const concurrency = Math.min(options?.concurrency || this.DEFAULT_CONCURRENCY, uniqueUrls.length);

      logger.info('Starting multi-URL scraping', {
        totalUrls: uniqueUrls.length,
        concurrency,
        processingTime: Date.now() - startTime
      });

      // Send scraping started progress
      if (sessionId) {
        this.sendBatchProgressUpdate(sessionId, {
          stage: 'scraping',
          currentUrl: uniqueUrls[0] || '',
          currentUrlIndex: 0,
          totalUrls: uniqueUrls.length,
          completedUrls: 0,
          failedUrls: 0,
          results: []
        });
      }

      // Process URLs with controlled concurrency
      const results = await this.processUrlBatch(uniqueUrls, concurrency, sessionId, options);

      // Calculate summary statistics
      const successfulResults = results.filter(r => r.success);
      const failedResults = results.filter(r => !r.success);
      const avgConfidence = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.confidence, 0) / successfulResults.length
        : 0;

      const processingTime = Date.now() - startTime;

      // Send completion progress
      if (sessionId) {
        this.sendBatchProgressUpdate(sessionId, {
          stage: 'completed',
          currentUrl: '',
          currentUrlIndex: uniqueUrls.length,
          totalUrls: uniqueUrls.length,
          completedUrls: successfulResults.length,
          failedUrls: failedResults.length,
          results
        });
      }

      logger.info('Multi-URL scraping completed', {
        totalUrls: uniqueUrls.length,
        successful: successfulResults.length,
        failed: failedResults.length,
        avgConfidence,
        processingTime
      });

      timer.stop();

      return {
        success: failedResults.length === 0 || options?.continueOnError === true,
        results,
        summary: {
          total: uniqueUrls.length,
          successful: successfulResults.length,
          failed: failedResults.length,
          confidence: avgConfidence,
          processingTime
        },
        metadata: {
          urls: uniqueUrls,
          timestamp: new Date().toISOString(),
          processingTime,
          concurrency
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const processingTime = Date.now() - startTime;

      logger.error('Multi-URL scraping failed', {
        error: errorMessage,
        urls,
        processingTime
      });

      timer.stop();

      // Send error progress
      if (sessionId) {
        this.sendBatchProgressUpdate(sessionId, {
          stage: 'error',
          currentUrl: '',
          currentUrlIndex: 0,
          totalUrls: urls.length,
          completedUrls: 0,
          failedUrls: urls.length,
          results: []
        });
      }

      return {
        success: false,
        results: [],
        summary: {
          total: urls.length,
          successful: 0,
          failed: urls.length,
          confidence: 0,
          processingTime
        },
        metadata: {
          urls,
          timestamp: new Date().toISOString(),
          processingTime,
          concurrency: options?.concurrency || this.DEFAULT_CONCURRENCY
        }
      };
    }
  }

  async scrapeFestivalUrl(url: string, sessionId?: string): Promise<ScrapingResult> {
    const timer = performanceService.createTimer('scrape_festival_url');
    timer.start();

    const startTime = Date.now();
    const metadata = {
      url,
      timestamp: new Date().toISOString(),
      processingTime: 0,
      pagesExplored: 0,
    };

    try {
      logger.info('Starting festival scraping', { url, sessionId });

      // Send initial progress update
      if (sessionId) {
        this.sendProgressUpdate(sessionId, {
          stage: 'fetching',
          progress: 0,
          message: 'Starting URL validation...',
          url,
          pagesProcessed: 0,
          totalPages: 0,
        });
      }

      // URL validation
      if (!this.isValidUrl(url)) {
        if (sessionId) {
          this.sendProgressUpdate(sessionId, {
            stage: 'fetching',
            progress: 0,
            message: 'URL validation failed',
            url,
          });
        }
        throw new ValidationError('Invalid URL format', { field: 'url', value: url });
      }

      // Fetch website content with multi-page exploration
      if (sessionId) {
        this.sendProgressUpdate(sessionId, {
          stage: 'fetching',
          progress: 10,
          message: 'Fetching website content...',
          url,
          pagesProcessed: 0,
          totalPages: this.MAX_PAGES,
        });
      }

      const websiteContent = await this.fetchWebsiteContentWithExploration(url, sessionId);
      metadata.pagesExplored = websiteContent.pagesExplored;

      // Extract festival data using Claude
      if (sessionId) {
        this.sendProgressUpdate(sessionId, {
          stage: 'extracting',
          progress: 60,
          message: 'Extracting festival data with AI...',
          url,
          pagesProcessed: metadata.pagesExplored,
          totalPages: this.MAX_PAGES,
        });
      }

      const extractionResult = await this.extractFestivalData(websiteContent.content, url, sessionId);

      metadata.processingTime = Date.now() - startTime;

      if (!extractionResult.success || !extractionResult.data) {
        if (sessionId) {
          this.sendProgressUpdate(sessionId, {
            stage: 'error',
            progress: 0,
            message: 'Failed to extract festival data',
            url,
          });
        }
        throw new ExternalServiceError(
          `Failed to extract festival data: ${extractionResult.error || 'Unknown error'}`,
          { service: 'claude-ai' }
        );
      }

      // Validate confidence score
      if (extractionResult.confidence < this.CONFIDENCE_THRESHOLD) {
        logger.warn('Low confidence score detected', {
          url,
          confidence: extractionResult.confidence
        });

        if (sessionId) {
          this.sendProgressUpdate(sessionId, {
            stage: 'validating',
            progress: 90,
            message: `Low confidence detected (${Math.round(extractionResult.confidence * 100)}%)`,
            url,
            confidence: extractionResult.confidence,
          });
        }
      } else if (sessionId) {
        this.sendProgressUpdate(sessionId, {
          stage: 'validating',
          progress: 90,
          message: `Data validated successfully (${Math.round(extractionResult.confidence * 100)}% confidence)`,
          url,
          confidence: extractionResult.confidence,
        });
      }

      // Send completion update
      if (sessionId) {
        this.sendProgressUpdate(sessionId, {
          stage: 'completed',
          progress: 100,
          message: 'Scraping completed successfully',
          url,
          pagesProcessed: metadata.pagesExplored,
          totalPages: this.MAX_PAGES,
          confidence: extractionResult.confidence,
          data: extractionResult.data as unknown as Record<string, unknown>,
        });
      }

      const duration = timer.stop();
      metadata.processingTime = duration;

      // Record performance metrics for successful scraping
      performanceService.recordMetric({
        name: 'scraping_successful_duration',
        value: duration,
        unit: 'ms',
        tags: {
          url: new URL(url).hostname,
          confidence: extractionResult.confidence > 0.8 ? 'high' : 'low',
          pagesExplored: metadata.pagesExplored.toString()
        }
      });

      return {
        success: true,
        data: extractionResult.data,
        confidence: extractionResult.confidence,
        metadata,
      };

    } catch (error) {
      const duration = timer.stop();
      metadata.processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Record performance metric for failed scraping
      performanceService.recordMetric({
        name: 'scraping_failed_duration',
        value: duration,
        unit: 'ms',
        tags: {
          url: new URL(url).hostname,
          error: errorMessage.includes('timeout') ? 'timeout' : 'other'
        }
      });

      logger.error('Scraping failed', {
        url,
        error: errorMessage,
        processingTime: metadata.processingTime
      });

      // Send error update via WebSocket
      if (sessionId) {
        this.sendProgressUpdate(sessionId, {
          stage: 'error',
          progress: 0,
          message: errorMessage,
          url,
        });
      }

      return {
        success: false,
        confidence: 0,
        error: errorMessage,
        metadata,
      };
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Prevent localhost and private network access
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.endsWith('.local')) {
        return false;
      }

      // Prevent internal IP addresses
      if (/^(169\.254\.|169\.254[0-9]|169\.254[0-9][0-9]|169\.254[0-9][0-9][0-9])$/.test(hostname)) {
        return false;
      }

      // Prevent non-standard ports
      const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
      if (port < 1 || port > 65535 || port === 0) {
        return false;
      }

      // All domains are allowed since festival data is public information
      // No domain restrictions needed for public festival websites

      return true;
    } catch (error) {
      logger.warn('URL validation failed', { url, error: error instanceof Error ? error.message : 'Unknown error' });
      return false;
    }
  }

  private async fetchWebsiteContentWithExploration(
    url: string,
    sessionId?: string
  ): Promise<{ content: string; pagesExplored: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      // Get main page content
      const mainContent = await this.fetchPageContent(url, controller);

      // Extract and explore additional pages
      const additionalPages = await this.exploreAdditionalPages(url, mainContent, controller, sessionId);

      clearTimeout(timeoutId);

      // Combine all content
      const allContent = [
        mainContent,
        ...additionalPages.map(page => page.content)
      ].join('\n\n=== PAGE SEPARATOR ===\n\n');

      return {
        content: allContent,
        pagesExplored: 1 + additionalPages.length
      };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async fetchPageContent(url: string, controller: AbortController): Promise<string> {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    // Basic content validation
    if (!content || content.length < 100) {
      throw new Error('Insufficient content found');
    }

    return content;
  }

  private async exploreAdditionalPages(
    baseUrl: string,
    mainContent: string,
    controller: AbortController,
    sessionId?: string
  ): Promise<Array<{ url: string; content: string; priority: number }>> {
    const pages: Array<{ url: string; content: string; priority: number }> = [];
    const baseUrlObj = new URL(baseUrl);
    const exploredUrls = new Set<string>([baseUrl]);

    const links = this.extractRelevantLinks(mainContent, baseUrlObj)
      .filter((link) => !exploredUrls.has(link.url))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.MAX_PAGES - 1);

    // Debug logging for discovered links
    logger.info('Links discovered for exploration', {
      totalLinks: links.length,
      bioLinks: links.filter(link =>
        link.url.includes('instructor') ||
        link.url.includes('teacher') ||
        link.url.includes('artist') ||
        link.url.includes('musician') ||
        link.url.includes('bio') ||
        link.url.includes('staff')
      ).map(link => ({ url: link.url, priority: link.priority })),
      highPriorityLinks: links.filter(link => link.priority >= 8).map(link => ({ url: link.url, priority: link.priority }))
    });

    const results = await Promise.allSettled(
      links.map(async (link) => {
        try {
          const content = await this.fetchPageContent(link.url, controller);
          exploredUrls.add(link.url);
          return { ...link, content };
        } catch (error) {
          logger.warn('Failed to fetch additional page', { url: link.url, error });
          return null;
        }
      })
    );

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        pages.push(result.value);
      }
    });

    return pages;
  }

  private extractRelevantLinks(content: string, baseUrl: URL): Array<{ url: string; priority: number }> {
    const keywords: Array<{ terms: string[]; priority: number }> = [
      { terms: ['program', 'schedule', 'timetable'], priority: 10 },
      { terms: ['teacher', 'instructor', 'artist', 'musician', 'lineup'], priority: 9 },
      { terms: ['register', 'ticket', 'booking', 'price'], priority: 8 },
      { terms: ['venue', 'location', 'accommodation'], priority: 7 },
      { terms: ['about', 'info', 'information'], priority: 6 },
      { terms: ['workshop', 'class', 'lesson'], priority: 5 },
    ];

    const links: Array<{ url: string; priority: number }> = [];
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1];
      const linkText = match[2].toLowerCase();

      if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
        continue;
      }

      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, baseUrl).href;
      } catch {
        continue;
      }

      if (!absoluteUrl.includes(baseUrl.hostname)) {
        continue;
      }

      let priority = 1;
      for (const { terms, priority: keywordPriority } of keywords) {
        if (terms.some((term) => linkText.includes(term) || href.toLowerCase().includes(term))) {
          priority = Math.max(priority, keywordPriority);
        }
      }

      if (href.includes('program') || href.includes('schedule')) priority += 2;
      if (href.includes('teacher') || href.includes('artist') || href.includes('musician')) priority += 2;
      if (href.includes('register') || href.includes('ticket')) priority += 1;

      if (!links.some((link) => link.url === absoluteUrl)) {
        links.push({ url: absoluteUrl, priority });
      }
    }

    return links;
  }

  private async fetchWebsiteContent(url: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();
      clearTimeout(timeoutId);

      // Basic content validation
      if (!content || content.length < 100) {
        throw new Error('Insufficient content found');
      }

      return content;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async extractFestivalData(
    content: string,
    sourceUrl: string,
    sessionId?: string
  ): Promise<{ success: boolean; data?: FestivalData; confidence: number; error?: string }> {
    try {
      // Preprocess content for AI consumption
      const processedContent = this.preprocessContent(content);

      // Debug logging for preprocessing
      logger.info('Content preprocessing completed', {
        originalLength: content.length,
        processedLength: processedContent.length,
        approach: 'simplified-ai-focused'
      });

      // Truncate content if too long (Claude context limits)
      const truncatedContent = processedContent.length > 100000
        ? processedContent.substring(0, 100000) + '...[content truncated]'
        : processedContent;

      const response = await anthropic.messages.create({
        model: configService.get('anthropicModel'),
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: buildPrimaryPrompt(truncatedContent, sourceUrl),
          },
        ],
      });

      const contentText = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim();

      logger.info('Raw AI response received', {
        model: configService.get('anthropicModel'),
        contentLength: contentText.length,
        preview: contentText.substring(0, 300),
      });

      const parseFestival = (text: string, context: string): RawFestivalData => {
        const cleaned = text.replace(/['"]?\s*\.\.\.\s*\d+\s*more characters\s*['"]?/gi, '');
        const jsonBlock = extractJsonBlock(cleaned);
        if (!jsonBlock) {
          throw new Error(`No JSON found in ${context} response`);
        }
        return parseWithRepair<RawFestivalData>(jsonBlock);
      };

      let festivalData: RawFestivalData;
      let confidence = 0.85;

      try {
        try {
          festivalData = parseFestival(contentText, 'primary');
          confidence = festivalData.confidence ?? confidence;
        } catch (primaryError) {
          logger.warn('Primary JSON extraction failed, attempting minimal prompt', {
            error: primaryError instanceof Error ? primaryError.message : primaryError,
          });

          const fallbackResponse = await anthropic.messages.create({
            model: configService.get('anthropicModel'),
            max_tokens: 2000,
            messages: [
              {
                role: 'user',
                content: buildMinimalPrompt(sourceUrl),
              },
            ],
          });

          const fallbackText = fallbackResponse.content
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('')
            .trim();

          festivalData = parseFestival(fallbackText, 'fallback');
          confidence = festivalData.confidence ?? confidence;
        }

        if (!festivalData.name || !festivalData.startDate || !festivalData.endDate) {
          throw new Error('Missing required festival fields');
        }

        if (!festivalData.venue || !festivalData.venue.name) {
          throw new Error('Missing venue information');
        }

        festivalData.teachers = festivalData.teachers || [];
        festivalData.musicians = festivalData.musicians || [];
        festivalData.prices = festivalData.prices || [];
        festivalData.tags = festivalData.tags || [];

        // Apply bio validation to prevent hallucinations
        const originalTeachers = [...festivalData.teachers];
        const originalMusicians = [...festivalData.musicians];

        festivalData.teachers = festivalData.teachers.map(teacher => {
          const originalBio = teacher.bio;
          const processedBio = this.validateBio(teacher.bio, teacher.name);

          // Log processing results (tutte le bio vengono mantenute)
          if (originalBio) {
            logger.info('Teacher bio processed', {
              name: teacher.name,
              originalLength: originalBio.length,
              processedLength: processedBio?.length || 0,
              preview: processedBio?.substring(0, 100) + (processedBio && processedBio.length > 100 ? '...' : '')
            });
          }

          return {
            ...teacher,
            bio: processedBio || originalBio // Mantieni sempre la bio originale
          };
        });

        festivalData.musicians = festivalData.musicians.map(musician => {
          const originalBio = musician.bio;
          const processedBio = this.validateBio(musician.bio, musician.name);

          // Log processing results (tutte le bio vengono mantenute)
          if (originalBio) {
            logger.info('Musician bio processed', {
              name: musician.name,
              originalLength: originalBio.length,
              processedLength: processedBio?.length || 0,
              preview: processedBio?.substring(0, 100) + (processedBio && processedBio.length > 100 ? '...' : '')
            });
          }

          return {
            ...musician,
            bio: processedBio || originalBio // Mantieni sempre la bio originale
          };
        });

        // Calculate bio statistics
        const teachersWithBio = festivalData.teachers.filter(t => t.bio && t.bio.length > 20).length;
        const musiciansWithBio = festivalData.musicians.filter(m => m.bio && m.bio.length > 20).length;

        logger.debug('Structured festival data parsed', {
          name: festivalData.name,
          teachersCount: festivalData.teachers.length,
          musiciansCount: festivalData.musicians.length,
          pricesCount: festivalData.prices.length,
          teachersWithBio,
          musiciansWithBio,
          bioQuality: {
            teachers: `${teachersWithBio}/${festivalData.teachers.length}`,
            musicians: `${musiciansWithBio}/${festivalData.musicians.length}`
          },
          confidence,
        });

        // Additional bio extraction logging
        logger.info('Bio extraction results', {
          teachersWithBio,
          musiciansWithBio,
          totalTeachers: festivalData.teachers.length,
          totalMusicians: festivalData.musicians.length,
          successRate: {
            teachers: festivalData.teachers.length > 0 ? (teachersWithBio / festivalData.teachers.length * 100).toFixed(1) + '%' : '0%',
            musicians: festivalData.musicians.length > 0 ? (musiciansWithBio / festivalData.musicians.length * 100).toFixed(1) + '%' : '0%'
          }
        });
      } catch (parseError) {
        logger.error('Failed to parse structured JSON', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          preview: contentText.substring(0, 500),
        });
        throw new ExternalServiceError(
          `Failed to parse festival data: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          { service: 'claude-ai' }
        );
      }

      // Validate festival data exists
      logger.info('Validating festival data exists', {
        festivalData: festivalData,
        festivalDataType: typeof festivalData,
        isNull: festivalData === null,
        isUndefined: festivalData === undefined,
        isObject: typeof festivalData === 'object'
      });

      if (!festivalData || typeof festivalData !== 'object') {
        throw new Error('Invalid festival data: parsed data is null or not an object');
      }

      // Normalize and validate data structure
      let normalizedData: FestivalData;
      try {
        normalizedData = this.normalizeFestivalData(festivalData, sourceUrl);
        logger.debug('Data normalization successful', {
          name: normalizedData.name,
          hasVenue: !!normalizedData.venue,
          hasVenues: !!normalizedData.venues,
          venuesCount: normalizedData.venues?.length || 0
        });
      } catch (normalizeError) {
        logger.error('Data normalization failed', {
          error: normalizeError instanceof Error ? normalizeError.message : 'Unknown error',
          festivalData: festivalData ? JSON.stringify(festivalData).substring(0, 500) : 'undefined festivalData'
        });
        throw new ExternalServiceError(
          `Failed to normalize festival data: ${normalizeError instanceof Error ? normalizeError.message : 'Unknown error'}`,
          { service: 'data-processing' }
        );
      }

      // Use confidence from structured output, override with calculated score if needed
      const finalConfidence = this.calculateConfidenceScore(normalizedData);
      confidence = Math.max(confidence, finalConfidence);

      // Apply quality scoring and auto-retry if needed
      if (confidence < this.CONFIDENCE_THRESHOLD) {
        logger.info('Low confidence score, attempting retry', { confidence, threshold: this.CONFIDENCE_THRESHOLD });

        // Retry with structured outputs
        const retryResult = await this.retryWithBackoff(
          async () => {
            const retryResponse = await anthropic.messages.create({
              model: configService.get('anthropicModel'),
              max_tokens: 8000,
              messages: [
                {
                  role: 'user',
                  content: buildRetryPrompt(truncatedContent, sourceUrl, confidence, this.CONFIDENCE_THRESHOLD),
                },
              ],
            });

            const retryText = retryResponse.content
              .map((block) => (block.type === 'text' ? block.text : ''))
              .join('')
              .trim();

            const retryJson = extractJsonBlock(retryText);
            if (!retryJson) {
              throw new Error('Retry response did not contain JSON payload');
            }

            const retryData = parseWithRepair<RawFestivalData>(retryJson);
            const retryNormalized = this.normalizeFestivalData(retryData, sourceUrl);
            const retryConfidence = Math.max(retryData.confidence ?? 0.85, this.calculateConfidenceScore(retryNormalized));

            return { data: retryNormalized, confidence: retryConfidence };
          },
          2 // max retries
        );

        if (retryResult.success && retryResult.data) {
          return {
            success: true,
            data: retryResult.data.data,
            confidence: retryResult.data.confidence,
          };
        }
      }

      return {
        success: true,
        data: normalizedData,
        confidence,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Festival data extraction failed', { error: errorMessage });
      return {
        success: false,
        confidence: 0,
        error: errorMessage,
      };
    }
  }

  private normalizeFestivalData(rawData: RawFestivalData, sourceUrl: string): FestivalData {
    // Convert date strings to Date objects
    const normalizeDate = (dateStr: string | undefined): Date | undefined => {
      if (!dateStr) return undefined;
      try {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? undefined : date;
      } catch {
        return undefined;
      }
    };

    const normalizePriceDate = (dateStr: string | undefined): Date | undefined => {
      return normalizeDate(dateStr);
    };

    // Sanitize string inputs
    const sanitizeString = (input: unknown): string | undefined => {
      if (typeof input !== 'string') return undefined;
      return input.trim().slice(0, 1000); // Limit length
    };

    const sanitizeArray = (input: unknown): string[] => {
      if (!Array.isArray(input)) return [];
      return input
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(item => item.length > 0)
        .slice(0, 50); // Limit array size
    };

    // Validate coordinates
    const validateCoordinate = (coord: unknown): number | undefined => {
      if (typeof coord !== 'number') return undefined;
      if (coord < -90 || coord > 90) return undefined; // Latitude bounds
      return coord;
    };

    // Validate price amount
    const validatePrice = (amount: unknown): number => {
      const num = typeof amount === 'number' ? amount : parseFloat(amount as string);
      return isNaN(num) || num < 0 ? 0 : num;
    };

    // Process venues - handle both single venue and multiple venues
    const processVenue = (venue: RawVenueData) => ({
      name: sanitizeString(venue.name) || 'Unknown Venue',
      address: sanitizeString(venue.address),
      city: sanitizeString(venue.city) || 'Unknown',
      state: sanitizeString(venue.state),
      country: sanitizeString(venue.country) || 'Unknown',
      postalCode: sanitizeString(venue.postalCode),
      latitude: validateCoordinate(venue.latitude),
      longitude: validateCoordinate(venue.longitude),
    });

    // Convert single venue to venues array for consistency
    let venues: Array<{
      name: string;
      city: string;
      country: string;
      address?: string;
      state?: string;
      postalCode?: string;
      latitude?: number;
      longitude?: number;
    }> = [];

    if (rawData.venues && Array.isArray(rawData.venues) && rawData.venues.length > 0) {
      // Use multiple venues if available
      venues = rawData.venues
        .filter(venue => venue && venue.name)
        .map(processVenue)
        .slice(0, 10); // Limit to 10 venues
    } else if (rawData.venue && rawData.venue.name) {
      // Convert single venue to array - check that venue exists and has name
      venues = [processVenue(rawData.venue)];
    }

    // For backward compatibility, set primary venue (first one)
    const primaryVenue = venues.length > 0 ? venues[0] : {
      name: 'Unknown Venue',
      city: 'Unknown',
      country: 'Unknown'
    };

    // Map raw data to FestivalData interface with validation
    return {
      name: sanitizeString(rawData.name) || 'Unknown Festival',
      description: sanitizeString(rawData.description),
      website: sanitizeString(rawData.website),
      facebook: sanitizeString(rawData.facebook),
      instagram: sanitizeString(rawData.instagram),
      email: sanitizeString(rawData.email),
      phone: sanitizeString(rawData.phone),
      startDate: normalizeDate(rawData.startDate) || new Date(),
      endDate: normalizeDate(rawData.endDate) || new Date(),
      timezone: sanitizeString(rawData.timezone),
      registrationDeadline: normalizePriceDate(rawData.registrationDeadline),
      registrationUrl: sanitizeString(rawData.registrationUrl),
      sourceUrl: sourceUrl,
      venue: primaryVenue,
      venues: venues && venues.length > 0 ? venues : undefined,
      teachers: Array.isArray(rawData.teachers) ? rawData.teachers.slice(0, 20).map((teacher: RawTeacherData) => ({
        name: sanitizeString(teacher.name) || 'Unknown Teacher',
        bio: sanitizeString(teacher.bio),
        specializations: Array.isArray(teacher.specializations) ?
          teacher.specializations.slice(0, 10).map((s: unknown) => sanitizeString(s)).filter((s): s is string => Boolean(s)) : [],
      })) : [],
      musicians: Array.isArray(rawData.musicians) ? rawData.musicians.slice(0, 20).map((musician: RawMusicianData) => ({
        name: sanitizeString(musician.name) || 'Unknown Musician',
        bio: sanitizeString(musician.bio),
        genre: Array.isArray(musician.genre) ?
          musician.genre.slice(0, 10).map((g: unknown) => sanitizeString(g)).filter((g): g is string => Boolean(g)) : [],
      })) : [],
      prices: Array.isArray(rawData.prices) ? rawData.prices.slice(0, 10).map((price: RawPriceData) => ({
        type: ['early_bird', 'regular', 'late', 'student', 'local', 'vip', 'donation'].includes(price.type) ?
          price.type : 'regular',
        amount: validatePrice(price.amount),
        currency: ['USD', 'EUR', 'GBP', 'CHF'].includes(price.currency) ? price.currency : 'USD',
        deadline: normalizePriceDate(price.deadline),
        description: sanitizeString(price.description),
      })) : [],
      tags: sanitizeArray(rawData.tags),
    };
  }

  private calculateConfidenceScore(data: FestivalData): number {
    let score = 0;
    let maxScore = 0;

    // Required fields with higher weight
    const requiredFields = [
      { field: data.name, weight: 0.2 },
      { field: data.startDate, weight: 0.2 },
      { field: data.endDate, weight: 0.1 },
      { field: data.venue?.name, weight: 0.15 },
      { field: data.venue?.city, weight: 0.1 },
      { field: data.venue?.country, weight: 0.1 },
    ];

    requiredFields.forEach(({ field, weight }) => {
      maxScore += weight;
      if (field && field.toString().trim().length > 0) {
        score += weight;
      }
    });

    // Optional fields with lower weight
    const optionalFields = [
      { field: data.description, weight: 0.05 },
      { field: data.website, weight: 0.05 },
      { field: data.registrationUrl, weight: 0.05 },
      { field: data.teachers?.length, weight: 0.02 },
      { field: data.musicians?.length, weight: 0.02 },
      { field: data.prices?.length, weight: 0.03 },
      { field: data.tags?.length, weight: 0.03 },
    ];

    optionalFields.forEach(({ field, weight }) => {
      maxScore += weight;
      if (typeof field === 'number' && field > 0) {
        score += weight;
      }
    });

    // Data validation bonuses/penalties
    if (data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (end >= start) {
        score += 0.05; // Valid date range
      } else {
        score -= 0.1; // Invalid date range
      }
    }

    // URL validation
    if (data.website && this.isValidUrl(data.website)) {
      score += 0.02;
    }

    return Math.min(1, Math.max(0, score / maxScore));
  }

  private preprocessContent(content: string): string {
    // Simple preprocessing: clean HTML but preserve structure for AI
    let processed = content;

    // Remove script and style tags completely
    processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    processed = processed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML comments
    processed = processed.replace(/<!--[\s\S]*?-->/g, '');

    // Remove navigation, footer, header elements
    processed = processed.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    processed = processed.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    processed = processed.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

    // Convert structural HTML to readable format but keep some semantic structure
    processed = processed.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n=== MAIN TITLE: $1 ===\n');
    processed = processed.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n== SECTION: $1 ==\n');
    processed = processed.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n--- SUBSECTION: $1 ---\n');

    // Handle common bio/musician/instructor section patterns
    processed = processed.replace(/<div[^>]*(?:class|id)[^>]*=\s*["'][^"']*(?:musician|artist|instructor|teacher|bio|profile|staff|faculty|lineup)[^"']*["'][^>]*>/gi, '\n=== BIO SECTION ===\n');
    processed = processed.replace(/<section[^>]*(?:class|id)[^>]*=\s*["'][^"']*(?:musician|artist|instructor|teacher|bio|profile|staff|faculty|lineup)[^"']*["'][^>]*>/gi, '\n=== BIO SECTION ===\n');
    processed = processed.replace(/<article[^>]*(?:class|id)[^>]*=\s*["'][^"']*(?:musician|artist|instructor|teacher|bio|profile|staff|faculty|lineup)[^"']*["'][^>]*>/gi, '\n=== BIO SECTION ===\n');

    // Mark individual person sections
    processed = processed.replace(/<h[4-6][^>]*>([^<]*(?:band|musician|artist|instructor|teacher|dj|performer)[^<]*)<\/h[4-6]>/gi, '\n--- PERSON: $1 ---\n');

    // Convert paragraphs and breaks to newlines
    processed = processed.replace(/<br\s*\/?>/gi, '\n');
    processed = processed.replace(/<\/p>/gi, '\n');
    processed = processed.replace(/<\/div>/gi, '\n');

    // Remove remaining HTML tags but keep content
    processed = processed.replace(/<[^>]+>/g, '');

    // Clean up whitespace and formatting
    processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n'); // Reduce multiple newlines
    processed = processed.replace(/^\s+|\s+$/gm, ''); // Trim lines
    processed = processed.replace(/([a-z])([A-Z])/g, '$1 $2'); // Fix spacing

    return processed.trim();
  }

  private validateBio(bio: string | undefined, name: string): string | undefined {
    // Rimuoviamo tutta la validazione per permettere a tutte le bio di raggiungere il database
    if (!bio) {
      logger.debug('No bio provided', { name });
      return undefined;
    }

    // Solo troncamento per bio molto lunghe (più di 5000 caratteri)
    if (bio.length > 5000) {
      logger.debug('Truncating very long bio', { name, originalLength: bio.length });
      return bio.substring(0, 5000);
    }

    logger.debug('Bio preserved without validation', {
      name,
      length: bio.length,
      preview: bio.substring(0, 100) + (bio.length > 100 ? '...' : '')
    });

    return bio;
  }


  private validateJsonSchema(data: RawFestivalData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields validation
    if (!data.name || typeof data.name !== 'string') {
      errors.push('name is required and must be a string');
    }

    if (!data.startDate || typeof data.startDate !== 'string') {
      errors.push('startDate is required and must be a string');
    }

    if (!data.endDate || typeof data.endDate !== 'string') {
      errors.push('endDate is required and must be a string');
    }

    // Venue validation
    if (data.venue && typeof data.venue === 'object') {
      if (!data.venue.name || typeof data.venue.name !== 'string') {
        errors.push('venue.name is required when venue is provided');
      }
    }

    // Array fields validation
    const arrayFields = ['teachers', 'musicians', 'prices', 'tags'];
    arrayFields.forEach(field => {
      if (data[field] && !Array.isArray(data[field])) {
        errors.push(`${field} must be an array if provided`);
      }
    });

    // Price validation - more flexible with unknown types
    if (data.prices && Array.isArray(data.prices)) {
      data.prices.forEach((price: RawPriceData, index: number) => {
        // Normalize price type to known values, default to 'regular' for unknown types
        const validPriceTypes = ['early_bird', 'regular', 'late', 'student', 'local', 'vip', 'donation'];
        const normalizedType = price.type && validPriceTypes.includes(price.type) ? price.type : 'regular';

        // Log normalization for debugging
        if (price.type && normalizedType !== price.type) {
          logger.debug(`Normalizing price type from "${price.type}" to "${normalizedType}" at index ${index}`);
        }

        // Only validate that price type exists, normalization will handle invalid values
        if (!price.type) {
          errors.push(`prices[${index}].type is required`);
        }
        // Only validate amount, currency normalization will handle invalid values
        if (typeof price.amount !== 'number' || price.amount < 0) {
          errors.push(`prices[${index}].amount must be a positive number`);
        }
        // Only validate that currency exists, normalization will handle invalid values
        if (!price.currency) {
          errors.push(`prices[${index}].currency is required`);
        }
      });
    }

    // Date format validation - strict for required dates, lenient for optional
    const requiredDateFields = ['startDate', 'endDate'];
    const optionalDateFields = ['registrationDeadline'];

    requiredDateFields.forEach(field => {
      const fieldValue = data[field as keyof RawFestivalData];
      if (typeof fieldValue === 'string') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(fieldValue)) {
          errors.push(`${field} must be in YYYY-MM-DD format`);
        }
      }
    });

    // Lenient validation for optional date fields - just remove if invalid
    optionalDateFields.forEach(field => {
      const fieldValue = data[field as keyof RawFestivalData];
      if (typeof fieldValue === 'string') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(fieldValue)) {
          (data as Record<string, unknown>)[field] = undefined;
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const result = await operation();
        return { success: true, data: result };
      } catch (error) {
        attempt += 1;

        if (attempt === maxRetries) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn('Retry attempts exhausted', { attempt: maxRetries, error: errorMessage });
          return { success: false, error: errorMessage };
        }

        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;

        logger.info('Retrying operation', { attempt, maxRetries, delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  private sendProgressUpdate(sessionId: string, progress: Omit<ScrapingProgress, 'type' | 'timestamp'>) {
    try {
      const scrapingProgress: ScrapingProgress = {
        type: 'scraping',
        timestamp: new Date().toISOString(),
        ...progress,
      };

      websocketService.sendScrapingProgress(sessionId, scrapingProgress);
    } catch (error) {
      logger.warn('Failed to send WebSocket progress update', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const scrapingService = new ScrapingService();
