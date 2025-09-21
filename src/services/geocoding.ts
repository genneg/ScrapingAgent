import { Client } from '@googlemaps/google-maps-services-js';
import { logger } from '@/lib/logger';

export interface GeocodeResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  confidence?: number;
  error?: string;
}

export interface ReverseGeocodeResult {
  success: boolean;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
  error?: string;
}

export class GeocodingService {
  private client: Client;
  private apiKey: string;
  private cache: Map<string, GeocodeResult> = new Map();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.client = new Client({});
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';

    if (!this.apiKey) {
      logger.warn('Google Maps API key not configured');
    }
  }

  async geocodeAddress(address: string, city?: string, country?: string): Promise<GeocodeResult> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Google Maps API key not configured',
        };
      }

      // Check cache first
      const cacheKey = this.getCacheKey(address, city, country);
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }

      // Build full address string
      const fullAddress = this.buildFullAddress(address, city, country);

      logger.info('Geocoding address', { address: fullAddress });

      const response = await this.client.geocode({
        params: {
          address: fullAddress,
          key: this.apiKey,
        },
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        const location = result.geometry.location;
        const confidence = this.calculateConfidence(result);

        const geocodeResult: GeocodeResult = {
          success: true,
          latitude: location.lat,
          longitude: location.lng,
          formattedAddress: result.formatted_address,
          confidence,
        };

        // Cache the result
        this.cache.set(cacheKey, geocodeResult);

        logger.info('Geocoding successful', {
          address: fullAddress,
          latitude: location.lat,
          longitude: location.lng,
          confidence,
        });

        return geocodeResult;
      } else {
        const error = response.data.error_message || `Geocoding failed: ${response.data.status}`;
        logger.warn('Geocoding failed', { address: fullAddress, error });

        const result: GeocodeResult = {
          success: false,
          error,
        };

        // Cache failed results briefly to avoid repeated calls
        this.cache.set(cacheKey, result);

        return result;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown geocoding error';
      logger.error('Geocoding service error', { error: errorMessage, address });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Google Maps API key not configured',
        };
      }

      // Check cache first
      const cacheKey = `reverse_${latitude}_${longitude}`;
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        // Convert cached GeocodeResult to ReverseGeocodeResult
        if (cached.success && cached.formattedAddress) {
          const address = this.parseFormattedAddress(cached.formattedAddress);
          return {
            success: true,
            address,
          };
        }
      }

      logger.info('Reverse geocoding coordinates', { latitude, longitude });

      const response = await this.client.reverseGeocode({
        params: {
          latlng: { lat: latitude, lng: longitude },
          key: this.apiKey,
        },
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        const address = this.parseAddressComponents(result.address_components);

        logger.info('Reverse geocoding successful', {
          latitude,
          longitude,
          address,
        });

        // Cache the result
        this.cache.set(cacheKey, {
          success: true,
          formattedAddress: result.formatted_address,
        });

        return {
          success: true,
          address,
        };
      } else {
        const error = response.data.error_message || `Reverse geocoding failed: ${response.data.status}`;
        logger.warn('Reverse geocoding failed', { latitude, longitude, error });

        return {
          success: false,
          error,
        };
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown reverse geocoding error';
      logger.error('Reverse geocoding service error', { error: errorMessage, latitude, longitude });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async validateCoordinates(latitude: number, longitude: number): Promise<boolean> {
    try {
      const result = await this.reverseGeocode(latitude, longitude);
      return result.success;
    } catch {
      return false;
    }
  }

  private buildFullAddress(address: string, city?: string, country?: string): string {
    const parts = [address];
    if (city) parts.push(city);
    if (country) parts.push(country);
    return parts.join(', ');
  }

  private getCacheKey(address: string, city?: string, country?: string): string {
    return `geocode_${[address, city, country].filter(Boolean).join('_').toLowerCase()}`;
  }

  private isCacheValid(result: GeocodeResult): boolean {
    // For now, assume cache is always valid if it exists
    // In a real implementation, you'd store timestamps and check TTL
    return true;
  }

  private calculateConfidence(result: any): number {
    let confidence = 0.5; // Base confidence

    // Check location type
    if (result.geometry.location_type === 'ROOFTOP') confidence += 0.3;
    else if (result.geometry.location_type === 'RANGE_INTERPOLATED') confidence += 0.2;
    else if (result.geometry.location_type === 'GEOMETRIC_CENTER') confidence += 0.1;

    // Check address components completeness
    const hasStreet = result.address_components.some((comp: any) =>
      comp.types.includes('route')
    );
    const hasCity = result.address_components.some((comp: any) =>
      comp.types.includes('locality')
    );
    const hasCountry = result.address_components.some((comp: any) =>
      comp.types.includes('country')
    );

    if (hasStreet) confidence += 0.1;
    if (hasCity) confidence += 0.05;
    if (hasCountry) confidence += 0.05;

    return Math.min(1.0, confidence);
  }

  private parseAddressComponents(components: any[]): {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  } {
    const address: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
    } = {};

    components.forEach(component => {
      const types = component.types;

      if (types.includes('street_number') || types.includes('route')) {
        address.street = address.street
          ? `${address.street} ${component.long_name}`
          : component.long_name;
      } else if (types.includes('locality')) {
        address.city = component.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        address.state = component.long_name;
      } else if (types.includes('country')) {
        address.country = component.long_name;
      } else if (types.includes('postal_code')) {
        address.postalCode = component.long_name;
      }
    });

    return address;
  }

  private parseFormattedAddress(formattedAddress: string): {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  } {
    // Simple parsing of formatted address
    const parts = formattedAddress.split(',').map(part => part.trim());

    const address: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
    } = {};

    if (parts.length > 0) {
      address.street = parts[0];
    }
    if (parts.length > 1) {
      const cityState = parts[1].split(' ');
      if (cityState.length > 0) {
        address.city = cityState[0];
      }
      if (cityState.length > 1) {
        address.state = cityState[1];
      }
    }
    if (parts.length > 2) {
      // Last part usually contains country and postal code
      const lastPart = parts[parts.length - 1];
      const postalMatch = lastPart.match(/\b\d{5}\b/);
      if (postalMatch) {
        address.postalCode = postalMatch[0];
        address.country = lastPart.replace(postalMatch[0], '').trim();
      } else {
        address.country = lastPart;
      }
    }

    return address;
  }

  // Batch geocoding for multiple addresses
  async batchGeocode(
    addresses: Array<{ address: string; city?: string; country?: string }>
  ): Promise<Array<{ input: string; result: GeocodeResult }>> {
    const results: Array<{ input: string; result: GeocodeResult }> = [];

    // Process in batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map(async ({ address, city, country }) => {
          const fullAddress = this.buildFullAddress(address, city, country);
          const result = await this.geocodeAddress(address, city, country);
          return { input: fullAddress, result };
        })
      );

      batchResults.forEach(promiseResult => {
        if (promiseResult.status === 'fulfilled') {
          results.push(promiseResult.value);
        }
      });

      // Small delay between batches to be respectful of rate limits
      if (i + batchSize < addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  // Clear cache (useful for testing or when you want fresh data)
  clearCache(): void {
    this.cache.clear();
    logger.info('Geocoding cache cleared');
  }

  // Get cache statistics
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const geocodingService = new GeocodingService();