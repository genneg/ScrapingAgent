import { anthropic } from '@/lib/anthropic';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';
import { ValidationError, ExternalServiceError } from '@/lib/errors';
import { websocketService, ScrapingProgress } from '@/lib/websocket';
import { performanceService } from '@/services/performance';

// Type definitions for raw festival data from AI
interface RawFestivalData {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  registrationDeadline?: string;
  venue?: RawVenueData;
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
  specialties?: string[];
}

interface RawMusicianData {
  name: string;
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
        throw new ValidationError('Invalid URL format', 'url', url);
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
          'claude-ai',
          extractionResult.error || 'Failed to extract festival data'
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

      // Check for allowed domains (optional - remove or customize as needed)
      const allowedDomains = process.env.ALLOWED_SCRAPING_DOMAINS?.split(',') || [];
      if (allowedDomains.length > 0) {
        const isAllowed = allowedDomains.some(domain =>
          hostname === domain || hostname.endsWith(`.${domain}`)
        );
        if (!isAllowed) {
          logger.warn('Domain not in allowed list', { hostname, allowedDomains });
          return false;
        }
      }

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

    // Extract relevant links from main content
    const links = this.extractRelevantLinks(mainContent, baseUrlObj);

    // Sort by priority and limit to MAX_PAGES - 1 (since we already have the main page)
    const topLinks = links
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.MAX_PAGES - 1);

    // Fetch additional pages concurrently
    const fetchPromises = topLinks
      .filter(link => !exploredUrls.has(link.url))
      .map(async (link) => {
        try {
          const content = await this.fetchPageContent(link.url, controller);
          exploredUrls.add(link.url);
          return { ...link, content };
        } catch (error) {
          logger.warn('Failed to fetch additional page', { url: link.url, error });
          return null;
        }
      });

    const results = await Promise.allSettled(fetchPromises);

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        pages.push(result.value);
      }
    });

    return pages;
  }

  private extractRelevantLinks(content: string, baseUrl: URL): Array<{ url: string; priority: number }> {
    const links: Array<{ url: string; priority: number }> = [];

    // Define keywords for different page types with priorities
    const keywords = [
      { terms: ['program', 'schedule', 'timetable'], priority: 10 },
      { terms: ['teacher', 'instructor', 'artist', 'lineup'], priority: 9 },
      { terms: ['register', 'ticket', 'booking', 'price'], priority: 8 },
      { terms: ['venue', 'location', 'accommodation'], priority: 7 },
      { terms: ['about', 'info', 'information'], priority: 6 },
      { terms: ['workshop', 'class', 'lesson'], priority: 5 },
    ];

    // Extract all links
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const href = match[1];
      const linkText = match[2].toLowerCase();

      // Skip empty, javascript, and anchor links
      if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
        continue;
      }

      // Resolve relative URLs
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, baseUrl).href;
      } catch {
        continue;
      }

      // Skip external domains
      if (!absoluteUrl.includes(baseUrl.hostname)) {
        continue;
      }

      // Calculate priority based on keywords
      let priority = 1; // Base priority
      for (const { terms, priority: keywordPriority } of keywords) {
        if (terms.some(term => linkText.includes(term) || href.toLowerCase().includes(term))) {
          priority = Math.max(priority, keywordPriority);
        }
      }

      // Additional priority for specific URL patterns
      if (href.includes('program') || href.includes('schedule')) priority += 2;
      if (href.includes('teacher') || href.includes('artist')) priority += 2;
      if (href.includes('register') || href.includes('ticket')) priority += 1;

      links.push({ url: absoluteUrl, priority });
    }

    // Remove duplicates
    const uniqueLinks = links.filter((link, index, self) =>
      index === self.findIndex(l => l.url === link.url)
    );

    return uniqueLinks;
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

      const prompt = this.buildExtractionPrompt(truncatedContent, sourceUrl);

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const contentText = response.content[0].type === 'text' ? response.content[0].text : '';

      // Extract JSON from response
      const jsonMatch = contentText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const festivalData = JSON.parse(jsonMatch[0]);

      // Validate JSON schema
      const schemaValidation = this.validateJsonSchema(festivalData);
      if (!schemaValidation.isValid) {
        throw new Error(`Invalid data schema: ${schemaValidation.errors.join(', ')}`);
      }

      // Validate 1940s presenter style
      const styleValidation = this.validate1940sStyle(contentText);
      if (!styleValidation.passed) {
        logger.warn('Style validation failed', { issues: styleValidation.issues });
      }

      // Validate English language
      const languageValidation = this.validateEnglishLanguage(contentText);
      if (!languageValidation.isEnglish) {
        logger.warn('Language validation failed', {
          detectedLanguage: languageValidation.detectedLanguage,
          confidence: languageValidation.confidence
        });
      }

      // Normalize and validate data structure
      const normalizedData = this.normalizeFestivalData(festivalData, sourceUrl);

      // Calculate confidence score
      const confidence = this.calculateConfidenceScore(normalizedData);

      // Apply quality scoring and auto-retry if needed
      if (confidence < this.CONFIDENCE_THRESHOLD) {
        logger.info('Low confidence score, attempting retry', { confidence, threshold: this.CONFIDENCE_THRESHOLD });

        // Retry with exponential backoff
        const retryResult = await this.retryWithBackoff(
          async () => {
            const retryPrompt = this.buildRetryPrompt(truncatedContent, sourceUrl, confidence);
            const retryResponse = await anthropic.messages.create({
              model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
              max_tokens: 4000,
              messages: [{ role: 'user', content: retryPrompt }],
            });

            const retryContentText = retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : '';
            const retryJsonMatch = retryContentText.match(/\{[\s\S]*\}/);
            if (!retryJsonMatch) throw new Error('No valid JSON found in retry response');

            const retryFestivalData = JSON.parse(retryJsonMatch[0]);
            const retryNormalized = this.normalizeFestivalData(retryFestivalData, sourceUrl);
            return { data: retryNormalized, confidence: this.calculateConfidenceScore(retryNormalized) };
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

  private buildExtractionPrompt(content: string, sourceUrl: string): string {
    return `Greetings, music enthusiast! I'm here to help you gather all the delightful details about this swing and blues festival. Let's extract the information in proper JSON format, shall we?

{
  "name": "Festival name",
  "description": "Brief description",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "timezone": "Timezone (e.g., UTC, Europe/Rome)",
  "registrationDeadline": "YYYY-MM-DD (optional)",
  "venue": {
    "name": "Venue name",
    "address": "Full address including street",
    "city": "City",
    "state": "State/Province (optional)",
    "country": "Country",
    "postalCode": "Postal code (optional)",
    "latitude": 00.000000 (optional),
    "longitude": 00.000000 (optional)"
  },
  "website": "Official website URL",
  "facebook": "Facebook URL (optional)",
  "instagram": "Instagram URL (optional)",
  "email": "Contact email (optional)",
  "phone": "Contact phone (optional)",
  "registrationUrl": "Registration/ticket URL",
  "teachers": [
    {
      "name": "Teacher name",
      "specialties": ["swing", "blues", "balboa", "collegiate shag", etc]
    }
  ],
  "musicians": [
    {
      "name": "Band/musician name",
      "genre": ["swing", "blues", "jazz", "etc"]
    }
  ],
  "prices": [
    {
      "type": "early_bird|regular|late|student|local|vip|donation",
      "amount": 150.00,
      "currency": "USD|EUR|GBP|CHF",
      "deadline": "YYYY-MM-DD (optional)",
      "description": "Additional price info (optional)"
    }
  ],
  "tags": ["swing", "blues", "festival", "workshop", "social", "dance"],
  "confidence": 0.95
}

Here's what I'll be looking for, my friend:
• Only include fields with actual information from the website
• Use empty arrays for teachers/musicians if none are found
• Make your best estimate for dates if not explicitly stated
• Set confidence score based on data completeness and clarity
• All text must be presented in fine English
• Keep the presentation professional and clear
• Date format must be YYYY-MM-DD
• For prices, use only the specified currency codes
• For venue, provide the most complete address information available

Now, let's see what wonderful details we can gather from ${sourceUrl}:

${content}`;
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
      venue: rawData.venue ? {
        name: sanitizeString(rawData.venue.name) || 'Unknown Venue',
        address: sanitizeString(rawData.venue.address),
        city: sanitizeString(rawData.venue.city),
        state: sanitizeString(rawData.venue.state),
        country: sanitizeString(rawData.venue.country),
        postalCode: sanitizeString(rawData.venue.postalCode),
        latitude: validateCoordinate(rawData.venue.latitude),
        longitude: validateCoordinate(rawData.venue.longitude),
      } : undefined,
      teachers: Array.isArray(rawData.teachers) ? rawData.teachers.slice(0, 20).map((teacher: RawTeacherData) => ({
        name: sanitizeString(teacher.name) || 'Unknown Teacher',
        specialties: Array.isArray(teacher.specialties) ?
          teacher.specialties.slice(0, 10).map((s: unknown) => sanitizeString(s)).filter((s): s is string => Boolean(s)) : [],
      })) : [],
      musicians: Array.isArray(rawData.musicians) ? rawData.musicians.slice(0, 20).map((musician: RawMusicianData) => ({
        name: sanitizeString(musician.name) || 'Unknown Musician',
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

    // Price validation
    if (data.prices && Array.isArray(data.prices)) {
      data.prices.forEach((price: RawPriceData, index: number) => {
        if (!price.type || !['early_bird', 'regular', 'late', 'student', 'local', 'vip', 'donation'].includes(price.type)) {
          errors.push(`prices[${index}].type must be one of: early_bird, regular, late, student, local, vip, donation`);
        }
        if (typeof price.amount !== 'number' || price.amount < 0) {
          errors.push(`prices[${index}].amount must be a positive number`);
        }
        if (!['USD', 'EUR', 'GBP', 'CHF'].includes(price.currency)) {
          errors.push(`prices[${index}].currency must be one of: USD, EUR, GBP, CHF`);
        }
      });
    }

    // Date format validation
    const dateFields = ['startDate', 'endDate', 'registrationDeadline'];
    dateFields.forEach(field => {
      const fieldValue = data[field as keyof RawFestivalData];
      if (typeof fieldValue === 'string') {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(fieldValue)) {
          errors.push(`${field} must be in YYYY-MM-DD format`);
        }
      }
    });

    // URL validation
    const urlFields = ['website', 'facebook', 'instagram', 'registrationUrl'];
    urlFields.forEach(field => {
      const fieldValue = data[field as keyof RawFestivalData];
      if (typeof fieldValue === 'string') {
        try {
          new URL(fieldValue);
        } catch {
          errors.push(`${field} must be a valid URL`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private validate1940sStyle(text: string): { passed: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for overly modern slang
    const modernSlang = ['lit', 'fire', 'basic', 'salty', 'extra', 'flex', 'woke', 'cancel', 'stan'];
    modernSlang.forEach(term => {
      if (text.toLowerCase().includes(term)) {
        issues.push(`Contains modern slang: ${term}`);
      }
    });

    // Check for appropriate tone indicators
    const friendlyTerms = ['my friend', 'shall we', 'delightful', 'wonderful', 'charming', 'lovely'];
    const hasFriendlyTone = friendlyTerms.some(term => text.toLowerCase().includes(term));

    if (!hasFriendlyTone) {
      issues.push('Lacks friendly, welcoming tone');
    }

    // Check for overly casual or aggressive language
    const aggressivePatterns = [/!\s*!/g, /\b(u r|ur|r u)\b/gi, /\b(wtf|omg|lol)\b/gi];
    aggressivePatterns.forEach(pattern => {
      if (pattern.test(text)) {
        issues.push('Contains overly casual or aggressive language');
      }
    });

    return {
      passed: issues.length <= 1, // Allow minor issues
      issues
    };
  }

  private validateEnglishLanguage(text: string): {
    isEnglish: boolean;
    detectedLanguage?: string;
    confidence: number;
  } {
    // Basic English language detection using common English words
    const commonEnglishWords = [
      'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'festival', 'music', 'dance', 'swing', 'blues'
    ];

    const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const englishWordCount = words.filter(word => commonEnglishWords.includes(word)).length;

    const englishRatio = words.length > 0 ? englishWordCount / words.length : 0;

    // Check for non-English character patterns (basic detection)
    const nonEnglishPatterns = /[^\x00-\x7F]/g;
    const nonEnglishChars = text.match(nonEnglishPatterns) || [];
    const nonEnglishRatio = nonEnglishChars.length / text.length;

    // Simple heuristic: if > 60% common English words and < 10% non-English characters, likely English
    const isEnglish = englishRatio > 0.6 && nonEnglishRatio < 0.1;

    return {
      isEnglish,
      confidence: Math.max(englishRatio, 1 - nonEnglishRatio),
      detectedLanguage: isEnglish ? 'english' : 'unknown'
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
        attempt++;

        if (attempt === maxRetries) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.warn('Retry attempts exhausted', { attempt: maxRetries, error: errorMessage });
          return { success: false, error: errorMessage };
        }

        // Exponential backoff with jitter
        const baseDelay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;

        logger.info('Retrying operation', { attempt, maxRetries, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  }

  private buildRetryPrompt(content: string, sourceUrl: string, previousConfidence: number): string {
    return `My friend, let's try again to extract the festival information from this website. The previous attempt had a confidence score of ${previousConfidence}, which was below our threshold of ${this.CONFIDENCE_THRESHOLD}.

Please be extra careful to provide complete and accurate information:

${this.buildExtractionPrompt(content, sourceUrl)}

Remember to focus particularly on:
• Complete venue information with address
• All teacher and musician names with their specialties
• Accurate dates in YYYY-MM-DD format
• Complete pricing information with proper currency codes
• High-quality, comprehensive data to achieve a confidence score above ${this.CONFIDENCE_THRESHOLD}`;
  }

  /**
   * Send progress update via WebSocket
   */
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
