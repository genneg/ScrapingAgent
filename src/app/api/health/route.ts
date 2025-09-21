import { NextResponse } from 'next/server';
import { supabaseService, testSupabaseConnection } from '@/lib/supabase';

export async function GET() {
  try {
    // Test database connection
    const isConnected = await testSupabaseConnection();

    if (!isConnected) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          error: 'Failed to connect to Supabase database',
        },
        { status: 500 }
      );
    }

    // Get database statistics
    const [festivalsCount, venuesCount, artistsCount] = await Promise.all([
      supabaseService.getFestivalsCount(),
      supabaseService.getVenuesCount(),
      supabaseService.getArtistsCount(),
    ]);

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      databaseType: 'Supabase',
      environment: process.env.NODE_ENV,
      statistics: {
        festivals: festivalsCount,
        venues: venuesCount,
        artists: artistsCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
