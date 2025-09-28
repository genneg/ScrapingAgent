import { Pool } from 'pg';
import { logger } from '@/lib/logger';

// Database configuration
const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;

const pool = new Pool({
  connectionString: dbUrl,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log('Database URL configured:', dbUrl ? '***SET***' : '***NOT SET***');

// Test connection
pool.on('connect', () => {
  logger.info('Database client connected');
});

pool.on('error', (err) => {
  logger.error('Database client error', err);
});

export interface DatabaseResult {
  success: boolean;
  data?: any;
  error?: string;
  rowCount?: number;
}

export class DirectDatabaseService {
  // Function to normalize musician names for deduplication
  private normalizeMusicianName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  // Function to check if two musician names refer to the same person
  private isSameMusician(name1: string, name2: string): boolean {
    const normalized1 = this.normalizeMusicianName(name1);
    const normalized2 = this.normalizeMusicianName(name2);

    // Exact match
    if (normalized1 === normalized2) return true;

    // Check if one is contained in the other (handle partial names)
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      // Additional check for common patterns like "Mayka Edjo" vs "Mayka Edjole Band"
      const baseName1 = normalized1.replace(/\s+(band|&\s*\w+)$/g, '');
      const baseName2 = normalized2.replace(/\s+(band|&\s*\w+)$/g, '');

      return baseName1 === baseName2 ||
             baseName1.includes(baseName2) ||
             baseName2.includes(baseName1);
    }

    return false;
  }

  // Function to merge musician data, preferring complete information
  private mergeMusicianData(existing: any, newData: any): any {
    return {
      ...existing,
      bio: existing.bio || newData.bio, // Keep existing bio if present
      instruments: [...new Set([...(existing.instruments || []), ...(newData.instruments || [])])], // Merge instruments
      website: existing.website || newData.website,
      image_url: existing.image_url || newData.image_url,
      updatedAt: new Date()
    };
  }

  async query(text: string, params?: any[]): Promise<DatabaseResult> {
    try {
      const start = Date.now();
      const result = await pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Database query executed', {
        text: text.substring(0, 100),
        params,
        rowCount: result.rowCount,
        duration,
      });

      return {
        success: true,
        data: result.rows,
        rowCount: result.rowCount || undefined,
      };
    } catch (error) {
      logger.error('Database query failed', {
        text: text.substring(0, 100),
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async insertFestival(festivalData: any): Promise<DatabaseResult> {
    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // Helper function to generate UUID
      const generateId = () => crypto.randomUUID();

      // Insert venue
      const venueId = generateId();
      const venueSlug = `${festivalData.venue.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')}-${Date.now()}`;

      await client.query(
        `INSERT INTO venues (id, name, city, country, slug, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          venueId,
          festivalData.venue.name,
          festivalData.venue.city,
          festivalData.venue.country,
          venueSlug
        ]
      );

      // Insert event
      const eventId = generateId();
      const eventSlug = `${festivalData.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')}-${Date.now()}`;

      await client.query(
        `INSERT INTO events (id, name, slug, description, "startDate", "endDate", status, "venueId", website, "registrationUrl", "sourceUrl", "scrapedAt", "publicationDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())`,
        [
          eventId,
          festivalData.name,
          eventSlug,
          festivalData.description || null,
          festivalData.startDate,
          festivalData.endDate,
          'DRAFT',
          venueId,
          festivalData.website || null,
          festivalData.registrationUrl || null,
          festivalData.sourceUrl || null,
          new Date() // scrapedAt
        ]
      );

      // Insert teachers if any
      if (festivalData.teachers && festivalData.teachers.length > 0) {
        for (const teacher of festivalData.teachers) {
          const teacherId = generateId();
          const teacherSlug = `${teacher.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')}-${Date.now()}`;

          await client.query(
            `INSERT INTO teachers (id, name, slug, bio, "specializations", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [
              teacherId,
              teacher.name,
              teacherSlug,
              teacher.bio || null,
              teacher.specializations || []
            ]
          );

          await client.query(
            `INSERT INTO event_teachers (id, "eventId", "teacherId", role, "workshops", "createdAt")
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [generateId(), eventId, teacherId, teacher.role || null, teacher.workshops || []]
          );
        }
      }

      // Insert musicians if any with deduplication
      if (festivalData.musicians && festivalData.musicians.length > 0) {
        for (const musician of festivalData.musicians) {
          // Check if musician already exists
          const existingMusicians = await client.query(
            `SELECT id, name, bio, instruments FROM musicians`
          );

          let musicianId = generateId();
          let musicianSlug = `${musician.name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')}-${Date.now()}`;
          let needsInsert = true;

          // Check for duplicates
          for (const existing of existingMusicians.rows) {
            if (this.isSameMusician(existing.name, musician.name)) {
              musicianId = existing.id;
              needsInsert = false;

              // If existing has no bio but new one does, update it
              if (!existing.bio && musician.bio) {
                await client.query(
                  `UPDATE musicians
                   SET bio = $1, instruments = $2, "updatedAt" = NOW()
                   WHERE id = $3`,
                  [
                    musician.bio,
                    musician.instruments || musician.genre || [],
                    existing.id
                  ]
                );
                logger.info('Updated musician with missing bio', {
                  existingName: existing.name,
                  newName: musician.name,
                  bioLength: musician.bio?.length
                });
              }
              break;
            }
          }

          if (needsInsert) {
            await client.query(
              `INSERT INTO musicians (id, name, slug, bio, "instruments", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
              [
                musicianId,
                musician.name,
                musicianSlug,
                musician.bio || null,
                musician.instruments || musician.genre || []
              ]
            );
          }

          // Check if musician is already associated with this event
          const existingEventMusician = await client.query(
            `SELECT id FROM event_musicians WHERE "eventId" = $1 AND "musicianId" = $2`,
            [eventId, musicianId]
          );

          // Only insert if not already associated
          if (existingEventMusician.rows.length === 0) {
            await client.query(
              `INSERT INTO event_musicians (id, "eventId", "musicianId", role, "setTimes", "createdAt")
               VALUES ($1, $2, $3, $4, $5, NOW())`,
              [generateId(), eventId, musicianId, musician.role || null, musician.setTimes || []]
            );
          } else {
            logger.info('Musician already associated with event, skipping duplicate insertion', {
              eventId,
              musicianId,
              musicianName: musician.name
            });
          }
        }
      }

      // Insert tags if any
      if (festivalData.tags && festivalData.tags.length > 0) {
        for (const tag of festivalData.tags) {
          await client.query(
            `INSERT INTO event_tags (id, "eventId", tag, "createdAt")
             VALUES ($1, $2, $3, NOW())`,
            [generateId(), eventId, tag.toLowerCase()]
          );
        }
      }

      // Insert prices if any
      if (festivalData.prices && festivalData.prices.length > 0) {
        for (const price of festivalData.prices) {
          await client.query(
            `INSERT INTO event_prices (id, "eventId", type, amount, currency, description, available, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
            [
              generateId(),
              eventId,
              price.type.toUpperCase(),
              price.amount,
              price.currency || 'USD',
              price.description || null,
              true
            ]
          );
        }
      }

      await client.query('COMMIT');

      return {
        success: true,
        data: {
          eventId,
          venueId,
          teachersCount: festivalData.teachers?.length || 0,
          musiciansCount: festivalData.musicians?.length || 0,
          tagsCount: festivalData.tags?.length || 0,
          pricesCount: festivalData.prices?.length || 0,
        },
      };

    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          // Ignore rollback errors
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Handle "Tenant or user not found" error specifically
      if (errorMessage.includes('Tenant or user not found')) {
        logger.error('Database connection failed - Invalid credentials or project not found', {
          error: errorMessage,
          suggestion: 'Please check Supabase project status and database credentials'
        });

        return {
          success: false,
          error: 'Database connection failed. Please check if the Supabase project is active and credentials are correct.',
        };
      }

      logger.error('Festival insertion failed', error);

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      return result.success;
    } catch {
      return false;
    }
  }

  async getFestivalById(id: string): Promise<any> {
    try {
      const result = await this.query(
        `SELECT
          f.*,
          json_build_object(
            'name', v.name,
            'address', v.address,
            'city', v.city,
            'state', v.state,
            'country', v.country,
            'postal_code', v.postal_code,
            'latitude', v.latitude,
            'longitude', v.longitude
          ) as venue,
          COALESCE(
            json_agg(
              json_build_object(
                'name', t.name,
                'bio', t.bio,
                'specializations', t.specializations
              ) ORDER BY t.name
            ) FILTER (WHERE t.id IS NOT NULL),
            '[]'
          ) as teachers,
          COALESCE(
            json_agg(
              json_build_object(
                'name', m.name,
                'bio', m.bio,
                'genre', m.genre
              ) ORDER BY m.name
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'
          ) as musicians,
          COALESCE(
            json_agg(
              json_build_object(
                'type', p.type,
                'amount', p.amount,
                'currency', p.currency,
                'deadline', p.deadline,
                'description', p.description
              ) ORDER BY p.deadline
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'
          ) as prices
        FROM festivals f
        LEFT JOIN venues v ON f.venue_id = v.id
        LEFT JOIN festival_teachers ft ON f.id = ft.festival_id
        LEFT JOIN teachers t ON ft.teacher_id = t.id
        LEFT JOIN festival_musicians fm ON f.id = fm.festival_id
        LEFT JOIN musicians m ON fm.musician_id = m.id
        LEFT JOIN prices p ON f.id = p.festival_id
        WHERE f.id = $1
        GROUP BY f.id, v.id`,
        [id]
      );

      if (!result.success || !result.data || result.data.length === 0) {
        return null;
      }

      const festival = result.data[0];

      // Transform the data to match FestivalData interface
      return {
        id: festival.id,
        name: festival.name,
        description: festival.description,
        website: festival.website,
        facebook: festival.facebook,
        instagram: festival.instagram,
        email: festival.email,
        phone: festival.phone,
        startDate: festival.start_date,
        endDate: festival.end_date,
        timezone: festival.timezone,
        venue: festival.venue ? {
          name: festival.venue.name,
          address: festival.venue.address,
          city: festival.venue.city,
          state: festival.venue.state,
          country: festival.venue.country,
          postalCode: festival.venue.postal_code,
          latitude: festival.venue.latitude,
          longitude: festival.venue.longitude,
        } : undefined,
        teachers: festival.teachers || [],
        musicians: festival.musicians || [],
        prices: festival.prices || [],
        tags: festival.tags || [],
        createdAt: festival.created_at,
        updatedAt: festival.updated_at,
      };
    } catch (error) {
      logger.error('Error fetching festival by ID', { id, error });
      throw error;
    }
  }

  async close(): Promise<void> {
    await pool.end();
  }
}

export const directDb = new DirectDatabaseService();
export const databaseService = directDb;