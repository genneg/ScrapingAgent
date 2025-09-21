import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';
import { validationService } from '@/services/validation';
import { duplicateDetectionService } from '@/services/duplicate-detection';
import { geocodingService } from '@/services/geocoding';

export interface DatabaseImportResult {
  success: boolean;
  festivalId?: string;
  errors: string[];
  warnings: string[];
  stats: {
    venuesCreated: number;
    teachersCreated: number;
    musiciansCreated: number;
    pricesCreated: number;
    tagsCreated: number;
  };
}

export class DatabaseService {
  async importFestivalData(
    data: FestivalData,
    options: {
      skipDuplicates?: boolean;
      geocodeVenue?: boolean;
      validateOnly?: boolean;
    } = {}
  ): Promise<DatabaseImportResult> {
    const result: DatabaseImportResult = {
      success: false,
      errors: [],
      warnings: [],
      stats: {
        venuesCreated: 0,
        teachersCreated: 0,
        musiciansCreated: 0,
        pricesCreated: 0,
        tagsCreated: 0,
      },
    };

    try {
      logger.info('Starting festival import', {
        festivalName: data.name,
        options,
      });

      // Validate data first
      const validation = await validationService.validateFestivalData(data);
      if (!validation.isValid) {
        result.errors.push(
          ...validation.errors
            .filter(e => e.severity === 'critical')
            .map(e => `${e.field}: ${e.message}`)
        );
        return result;
      }

      // Use normalized data
      const normalizedData = validation.normalizedData || data;

      // Check for duplicates
      const duplicates = await duplicateDetectionService.detectDuplicates(normalizedData);
      if (duplicates.hasDuplicates && duplicates.duplicates.festivals.length > 0) {
        const exactDuplicate = duplicates.duplicates.festivals.find(d => d.matchType === 'exact');
        if (exactDuplicate && options.skipDuplicates !== false) {
          result.errors.push(`Exact duplicate found: ${exactDuplicate.existingName}`);
          return result;
        }
      }

      // If validate only, return here
      if (options.validateOnly) {
        result.success = true;
        result.warnings.push(
          ...validation.warnings.map(w => w.message)
        );
        return result;
      }

      // Start database transaction
      const importResult = await prisma.$transaction(async (tx) => {
        const stats = {
          venuesCreated: 0,
          teachersCreated: 0,
          musiciansCreated: 0,
          pricesCreated: 0,
          tagsCreated: 0,
        };

        // Create or get venue
        let venueId: string | undefined;
        if (normalizedData.venue) {
          venueId = await this.createOrUpdateVenue(tx, normalizedData.venue, {
            geocode: options.geocodeVenue,
          });
          if (venueId) stats.venuesCreated++;
        }

        // Generate unique slug
        const slug = await this.generateUniqueSlug(
          normalizedData.name,
          'events',
          tx
        );

        // Create the main festival event
        const festival = await tx.events.create({
          data: {
            name: normalizedData.name,
            slug,
            description: normalizedData.description,
            shortDesc: normalizedData.description?.substring(0, 200),
            startDate: new Date(normalizedData.startDate),
            endDate: new Date(normalizedData.endDate),
            registrationDeadline: normalizedData.registrationDeadline
              ? new Date(normalizedData.registrationDeadline)
              : null,
            status: 'DRAFT',
            featured: false,
            capacity: null,
            venueId,
            website: normalizedData.website || null,
            registrationUrl: normalizedData.registrationUrl || null,
            imageUrl: null,
            createdById: null,
            sourceUrl: normalizedData.sourceUrl || null,
            scrapedAt: new Date(),
            verified: false,
          },
        });

        // Create teachers and relationships
        if (normalizedData.teachers && normalizedData.teachers.length > 0) {
          await this.createTeachersAndRelations(
            tx,
            normalizedData.teachers,
            festival.id,
            stats
          );
        }

        // Create musicians and relationships
        if (normalizedData.musicians && normalizedData.musicians.length > 0) {
          await this.createMusiciansAndRelations(
            tx,
            normalizedData.musicians,
            festival.id,
            stats
          );
        }

        // Create prices
        if (normalizedData.prices && normalizedData.prices.length > 0) {
          await this.createPrices(tx, normalizedData.prices, festival.id, stats);
        }

        // Create tags
        if (normalizedData.tags && normalizedData.tags.length > 0) {
          await this.createTags(tx, normalizedData.tags, festival.id, stats);
        }

        return {
          festivalId: festival.id,
          stats,
        };
      });

      result.success = true;
      result.festivalId = importResult.festivalId;
      result.stats = importResult.stats;

      logger.info('Festival import completed successfully', {
        festivalId: importResult.festivalId,
        stats: importResult.stats,
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Database import failed';
      logger.error('Festival import failed', { error: errorMessage });

      result.errors.push(errorMessage);
      return result;
    }
  }

  private async createOrUpdateVenue(
    tx: any,
    venueData: FestivalData['venue'],
    options: { geocode?: boolean }
  ): Promise<string> {
    // Check for existing venue by name and location
    const existingVenue = await tx.venues.findFirst({
      where: {
        name: {
          equals: venueData.name,
          mode: 'insensitive',
        },
        city: {
          equals: venueData.city,
          mode: 'insensitive',
        },
      },
    });

    if (existingVenue) {
      logger.info('Using existing venue', { venueId: existingVenue.id, name: existingVenue.name });
      return existingVenue.id;
    }

    // Geocode if requested and coordinates not provided
    let latitude = venueData.latitude;
    let longitude = venueData.longitude;

    if (options.geocode && (!latitude || !longitude) && venueData.address && venueData.city) {
      try {
        const geocodeResult = await geocodingService.geocodeAddress(
          venueData.address,
          venueData.city,
          venueData.country
        );

        if (geocodeResult.success && geocodeResult.latitude && geocodeResult.longitude) {
          latitude = geocodeResult.latitude;
          longitude = geocodeResult.longitude;
          logger.info('Venue geocoded successfully', {
            venueName: venueData.name,
            latitude,
            longitude,
          });
        }
      } catch (error) {
        logger.warn('Venue geocoding failed', { venueName: venueData.name, error });
      }
    }

    // Generate slug
    const slug = await this.generateUniqueSlug(venueData.name, 'venues', tx);

    // Create new venue
    const venue = await tx.venues.create({
      data: {
        name: venueData.name,
        slug,
        address: venueData.address || null,
        city: venueData.city,
        state: venueData.state || null,
        country: venueData.country,
        postalCode: venueData.postalCode || null,
        latitude,
        longitude,
        website: null,
        phone: null,
        email: null,
        capacity: null,
        description: null,
        hasParking: false,
        hasAirCon: false,
        hasWifi: false,
        wheelchairAccess: false,
      },
    });

    logger.info('New venue created', { venueId: venue.id, name: venue.name });
    return venue.id;
  }

  private async createTeachersAndRelations(
    tx: any,
    teachers: FestivalData['teachers'],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    for (const teacherData of teachers) {
      try {
        // Check for existing teacher
        const existingTeacher = await tx.teachers.findFirst({
          where: {
            name: {
              equals: teacherData.name,
              mode: 'insensitive',
            },
          },
        });

        let teacherId: string;
        if (existingTeacher) {
          teacherId = existingTeacher.id;

          // Update specializations if needed
          if (teacherData.specialties && teacherData.specialties.length > 0) {
            await this.updateTeacherSpecialties(tx, existingTeacher.id, teacherData.specialties);
          }
        } else {
          // Create new teacher
          const slug = await this.generateUniqueSlug(teacherData.name, 'teachers', tx);

          const teacher = await tx.teachers.create({
            data: {
              name: teacherData.name,
              slug,
              bio: null,
              avatar: null,
              verified: false,
              yearsActive: null,
              website: null,
              email: null,
              specializations: teacherData.specialties || [],
            },
          });

          teacherId = teacher.id;
          stats.teachersCreated++;

          // Create specializations
          if (teacherData.specialties && teacherData.specialties.length > 0) {
            await this.createTeacherSpecialties(tx, teacher.id, teacherData.specialties);
          }
        }

        // Create event-teacher relationship
        await tx.event_teachers.create({
          data: {
            eventId: festivalId,
            teacherId,
            role: null,
            workshops: [],
            level: null,
          },
        });

      } catch (error) {
        logger.error('Failed to create teacher relationship', {
          teacherName: teacherData.name,
          festivalId,
          error,
        });
      }
    }
  }

  private async createMusiciansAndRelations(
    tx: any,
    musicians: FestivalData['musicians'],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    for (const musicianData of musicians) {
      try {
        // Check for existing musician
        const existingMusician = await tx.musicians.findFirst({
          where: {
            name: {
              equals: musicianData.name,
              mode: 'insensitive',
            },
          },
        });

        let musicianId: string;
        if (existingMusician) {
          musicianId = existingMusician.id;

          // Update genres if needed
          if (musicianData.genre && musicianData.genre.length > 0) {
            await this.updateMusicianGenres(tx, existingMusician.id, musicianData.genre);
          }
        } else {
          // Create new musician
          const slug = await this.generateUniqueSlug(musicianData.name, 'musicians', tx);

          const musician = await tx.musicians.create({
            data: {
              name: musicianData.name,
              slug,
              bio: null,
              avatar: null,
              verified: false,
              instruments: [],
              yearsActive: null,
              website: null,
              email: null,
            },
          });

          musicianId = musician.id;
          stats.musiciansCreated++;

          // Create genres
          if (musicianData.genre && musicianData.genre.length > 0) {
            await this.createMusicianGenres(tx, musician.id, musicianData.genre);
          }
        }

        // Create event-musician relationship
        await tx.event_musicians.create({
          data: {
            eventId: festivalId,
            musicianId,
            role: null,
            setTimes: [],
          },
        });

      } catch (error) {
        logger.error('Failed to create musician relationship', {
          musicianName: musicianData.name,
          festivalId,
          error,
        });
      }
    }
  }

  private async createPrices(
    tx: any,
    prices: FestivalData['prices'],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    for (const priceData of prices) {
      try {
        await tx.event_prices.create({
          data: {
            eventId: festivalId,
            type: priceData.type.toUpperCase() as any,
            amount: priceData.amount,
            currency: priceData.currency,
            deadline: priceData.deadline ? new Date(priceData.deadline) : null,
            description: priceData.description || null,
            available: true,
          },
        });

        stats.pricesCreated++;
      } catch (error) {
        logger.error('Failed to create price', {
          priceType: priceData.type,
          festivalId,
          error,
        });
      }
    }
  }

  private async createTags(
    tx: any,
    tags: string[],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    for (const tag of tags) {
      try {
        await tx.event_tags.create({
          data: {
            eventId: festivalId,
            tag: tag.toLowerCase(),
          },
        });

        stats.tagsCreated++;
      } catch (error) {
        logger.error('Failed to create tag', { tag, festivalId, error });
      }
    }
  }

  private async generateUniqueSlug(
    baseName: string,
    table: 'events' | 'venues' | 'teachers' | 'musicians',
    tx: any
  ): Promise<string> {
    // Create base slug
    let slug = baseName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Remove leading/trailing hyphens
    slug = slug.replace(/^-+|-+$/g, '');

    // If slug is empty, use a default
    if (!slug) {
      slug = table === 'events' ? 'festival' : table.slice(0, -1);
    }

    // Check for uniqueness and add number if needed
    let counter = 1;
    let finalSlug = slug;
    let isUnique = false;

    while (!isUnique) {
      try {
        // Check if slug exists
        const existing = await tx[table].findUnique({
          where: { slug: finalSlug },
        });

        if (!existing) {
          isUnique = true;
        } else {
          counter++;
          finalSlug = `${slug}-${counter}`;
        }
      } catch (error) {
        // If query fails, assume it's unique
        isUnique = true;
      }
    }

    return finalSlug;
  }

  private async createTeacherSpecialties(
    tx: any,
    teacherId: string,
    specialties: string[]
  ): Promise<void> {
    for (const specialty of specialties) {
      try {
        await tx.teacher_specialties.create({
          data: {
            teacherId,
            specialty: specialty.toLowerCase(),
          },
        });
      } catch (error) {
        logger.error('Failed to create teacher specialty', {
          teacherId,
          specialty,
          error,
        });
      }
    }
  }

  private async updateTeacherSpecialties(
    tx: any,
    teacherId: string,
    specialties: string[]
  ): Promise<void> {
    // Delete existing specialties
    await tx.teacher_specialties.deleteMany({
      where: { teacherId },
    });

    // Create new specialties
    await this.createTeacherSpecialties(tx, teacherId, specialties);
  }

  private async createMusicianGenres(
    tx: any,
    musicianId: string,
    genres: string[]
  ): Promise<void> {
    for (const genre of genres) {
      try {
        await tx.musician_genres.create({
          data: {
            musicianId,
            genre: genre.toLowerCase(),
          },
        });
      } catch (error) {
        logger.error('Failed to create musician genre', {
          musicianId,
          genre,
          error,
        });
      }
    }
  }

  private async updateMusicianGenres(
    tx: any,
    musicianId: string,
    genres: string[]
  ): Promise<void> {
    // Delete existing genres
    await tx.musician_genres.deleteMany({
      where: { musicianId },
    });

    // Create new genres
    await this.createMusicianGenres(tx, musicianId, genres);
  }
}

export const databaseService = new DatabaseService();