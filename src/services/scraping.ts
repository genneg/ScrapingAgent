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
  specialties?: string[];
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

export class ScrapingService {
  private readonly CONFIDENCE_THRESHOLD: number;
  private readonly MAX_PAGES: number;
  private readonly TIMEOUT: number;

  constructor() {
    this.CONFIDENCE_THRESHOLD = parseFloat(process.env.SCRAPING_CONFIDENCE_THRESHOLD || '0.85');
    this.MAX_PAGES = parseInt(process.env.SCRAPING_MAX_PAGES || '15');
    this.TIMEOUT = parseInt(process.env.SCRAPING_TIMEOUT || '30000');
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
      { terms: ['teacher', 'instructor', 'artist', 'lineup'], priority: 9 },
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
      if (href.includes('teacher') || href.includes('artist')) priority += 2;
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

        logger.debug('Structured festival data parsed', {
          name: festivalData.name,
          teachersCount: festivalData.teachers.length,
          musiciansCount: festivalData.musicians.length,
          pricesCount: festivalData.prices.length,
          confidence,
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
        specialties: Array.isArray(teacher.specialties) ?
          teacher.specialties.slice(0, 10).map((s: unknown) => sanitizeString(s)).filter((s): s is string => Boolean(s)) : [],
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
    // Remove excessive whitespace
    let processed = content.replace(/\s+/g, ' ');

    // Remove script and style tags content
    processed = processed.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    processed = processed.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML comments
    processed = processed.replace(/<!--[\s\S]*?-->/g, '');

    // Remove navigation, footer, header elements (basic pattern)
    processed = processed.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    processed = processed.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    processed = processed.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');

    // Normalize HTML structure
    processed = processed.replace(/<br\s*\/?>/gi, '\n');
    processed = processed.replace(/<\/p>/gi, '\n');
    processed = processed.replace(/<\/div>/gi, '\n');
    processed = processed.replace(/<\/h[1-6]>/gi, '\n');

    // Remove remaining HTML tags but preserve content
    processed = processed.replace(/<[^>]+>/g, '');

    // Clean up excessive newlines and spaces
    processed = processed.replace(/\n\s*\n/g, '\n');
    processed = processed.replace(/^\s+|\s+$/gm, '');

    // Ensure proper spacing around text
    processed = processed.replace(/([a-z])([A-Z])/g, '$1 $2');

    return processed.trim();
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
