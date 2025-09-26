import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Create and configure Supabase client
 */
export function createSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration in environment variables');
  }

  logger.info('Initializing Supabase client', { url: supabaseUrl });

  supabaseInstance = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });

  return supabaseInstance;
}

/**
 * Get Supabase client instance
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    return createSupabaseClient();
  }
  return supabaseInstance;
}

/**
 * Test database connection
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const supabase = createSupabaseClient();

    // Test by querying the database
    const { data, error } = await supabase
      .from('festivals')
      .select('count')
      .limit(1);

    if (error) {
      logger.error('Supabase connection test failed', { error });
      return false;
    }

    logger.info('Supabase connection test successful');
    return true;
  } catch (error) {
    logger.error('Unexpected error during Supabase connection test', { error });
    return false;
  }
}

/**
 * Database operations wrapper
 */
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createSupabaseClient();
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const isConnected = await testSupabaseConnection();
      return { success: isConnected };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get festivals count
   */
  async getFestivalsCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from('festivals')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error('Error getting festivals count', { error });
      throw error;
    }

    return count || 0;
  }

  /**
   * Get venues count
   */
  async getVenuesCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from('venues')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error('Error getting venues count', { error });
      throw error;
    }

    return count || 0;
  }

  /**
   * Get artists count
   */
  async getArtistsCount(): Promise<number> {
    const { count, error } = await this.supabase
      .from('artists')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error('Error getting artists count', { error });
      throw error;
    }

    return count || 0;
  }

  /**
   * Create festival with related entities
   */
  async createFestival(festivalData: any): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      logger.info('Creating festival', { name: festivalData.name });

      // Start a transaction by using RPC
      const { data, error } = await this.supabase.rpc('create_festival_with_relations', {
        festival_data: festivalData
      });

      if (error) {
        logger.error('Error creating festival', { error });
        return { success: false, error: error.message };
      }

      logger.info('Festival created successfully', { festivalId: data?.id });
      return { success: true, data };
    } catch (error) {
      logger.error('Unexpected error creating festival', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check for duplicate festivals
   */
  async checkDuplicateFestival(name: string, startDate: string, endDate: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('festivals')
      .select('id')
      .ilike('name', `%${name}%`)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .limit(1);

    if (error) {
      logger.error('Error checking duplicate festival', { error });
      throw error;
    }

    return data && data.length > 0;
  }
}

// Export singleton instance
export const supabaseService = new SupabaseService();