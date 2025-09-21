import { prisma } from './prisma';

export async function testDatabaseConnection() {
  try {
    // Test basic connection
    await prisma.$queryRaw`SELECT NOW()`;

    // Test if we can query the database
    const festivalCount = await prisma.festival.count();

    return {
      success: true,
      message: 'Database connection successful',
      festivalCount,
    };
  } catch (error) {
    console.error('Database connection error:', error);
    return {
      success: false,
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
