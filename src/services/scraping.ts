import { anthropic } from '@/lib/anthropic';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';

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
  private readonly CONFIDENCE_THRESHOLD = 0.85;
  private readonly MAX_PAGES = 15;
  private readonly TIMEOUT = 30000;

  async scrapeFestivalUrl(url: string): Promise<ScrapingResult> {
    const startTime = Date.now();
    const metadata = {
      url,
      timestamp: new Date().toISOString(),
      processingTime: 0,
      pagesExplored: 0,
    };

    try {
      logger.info('Starting festival scraping', { url });

      // URL validation
      if (!this.isValidUrl(url)) {
        throw new Error('Invalid URL format');
      }

      // Fetch website content with multi-page exploration
      const websiteContent = await this.fetchWebsiteContentWithExploration(url);
      metadata.pagesExplored = websiteContent.pagesExplored;

      // Extract festival data using Claude
      const extractionResult = await this.extractFestivalData(websiteContent.content, url);

      metadata.processingTime = Date.now() - startTime;

      if (!extractionResult.success || !extractionResult.data) {
        throw new Error(extractionResult.error || 'Failed to extract festival data');
      }

      // Validate confidence score
      if (extractionResult.confidence < this.CONFIDENCE_THRESHOLD) {
        logger.warn('Low confidence score detected', {
          url,
          confidence: extractionResult.confidence
        });
      }

      return {
        success: true,
        data: extractionResult.data,
        confidence: extractionResult.confidence,
        metadata,
      };

    } catch (error) {
      metadata.processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Scraping failed', {
        url,
        error: errorMessage,
        processingTime: metadata.processingTime
      });

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
      return ['http:', 'https:'].includes(urlObj.protocol);
    } catch {
      return false;
    }
  }

  private async fetchWebsiteContentWithExploration(
    url: string
  ): Promise<{ content: string; pagesExplored: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      // Get main page content
      const mainContent = await this.fetchPageContent(url, controller);

      // Extract and explore additional pages
      const additionalPages = await this.exploreAdditionalPages(url, mainContent, controller);

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
    controller: AbortController
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
    sourceUrl: string
  ): Promise<{ success: boolean; data?: FestivalData; confidence: number; error?: string }> {
    try {
      // Truncate content if too long (Claude context limits)
      const truncatedContent = content.length > 100000
        ? content.substring(0, 100000) + '...[content truncated]'
        : content;

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

      const contentText = response.content[0].text;

      // Extract JSON from response
      const jsonMatch = contentText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }

      const festivalData = JSON.parse(jsonMatch[0]);

      // Calculate confidence score
      const confidence = this.calculateConfidenceScore(festivalData);

      return {
        success: true,
        data: festivalData,
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
    return `You are an expert festival data extractor analyzing a website about a swing/blues music festival. Extract all relevant information in JSON format with the following structure:

{
  "name": "Festival name",
  "description": "Brief description",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "venue": {
    "name": "Venue name",
    "address": "Full address",
    "city": "City",
    "country": "Country"
  },
  "website": "Official website URL",
  "registrationUrl": "Registration/ticket URL",
  "teachers": [
    {
      "name": "Teacher name",
      "specialties": ["swing", "blues", "balboa", etc]
    }
  ],
  "musicians": [
    {
      "name": "Band/musician name",
      "genre": ["swing", "blues", "jazz", etc]
    }
  ],
  "prices": [
    {
      "type": "early_bird|regular|late|student",
      "amount": 150.00,
      "currency": "USD|EUR|GBP"
    }
  ],
  "tags": ["swing", "blues", "festival", "workshop", "social"],
  "confidence": 0.95
}

Rules:
1. Only include fields with actual data from the website
2. Use empty arrays for teachers/musicians if none found
3. Use best estimates for dates if not explicitly stated
4. Set confidence score based on data completeness and clarity
5. All text must be in English
6. Present information in clear, professional manner

Website content from ${sourceUrl}:

${content}`;
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
      if (field && field > 0) {
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
}

export const scrapingService = new ScrapingService();
