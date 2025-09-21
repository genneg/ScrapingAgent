import { supabaseService } from '../src/lib/supabase'

async function testConnection() {
  try {
    console.log('🔍 Testing Supabase database connection...')

    // Test the connection
    const connectionTest = await supabaseService.testConnection()

    if (!connectionTest.success) {
      console.error('❌ Database connection failed:', connectionTest.error)
      return {
        success: false,
        error: connectionTest.error
      }
    }

    console.log('✅ Database connection successful!')

    // Test queries
    const [festivalCount, venueCount, artistCount] = await Promise.all([
      supabaseService.getFestivalsCount(),
      supabaseService.getVenuesCount(),
      supabaseService.getArtistsCount()
    ])

    console.log(`📊 Found ${festivalCount} festivals in database`)
    console.log(`📍 Found ${venueCount} venues in database`)
    console.log(`🎭 Found ${artistCount} artists in database`)

    return {
      success: true,
      festivalCount,
      venueCount,
      artistCount
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Export for use in other modules
export { testConnection }

// Run test if this file is executed directly
if (require.main === module) {
  testConnection()
    .then(result => {
      if (result.success) {
        console.log('🎉 All database tests passed!')
        process.exit(0)
      } else {
        console.log('💥 Database tests failed!')
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('💥 Unexpected error:', error)
      process.exit(1)
    })
}