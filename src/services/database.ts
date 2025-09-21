import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';
import { validationService } from '@/services/validation';
import { duplicateDetectionService } from '@/services/duplicate-detection';
import { geocodingService } from '@/services/geocoding';
import { configService } from '@/lib/config';
import { DatabaseError, ConflictError, ValidationError, ErrorUtils, BaseError } from '@/lib/errors';
import { Prisma } from '@prisma/client';

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

      // Check for duplicates with optimized query
      const duplicates = await duplicateDetectionService.detectDuplicates(normalizedData);
      if (duplicates.hasDuplicates && duplicates.duplicates.festivals.length > 0) {
        const exactDuplicate = duplicates.duplicates.festivals.find(d => d.matchType === 'high');
        if (exactDuplicate && options.skipDuplicates !== false) {
          result.errors.push(`Exact duplicate found: ${exactDuplicate.existingName}`);
          return result;
        }
      }

      // Performance monitoring
      const startTime = Date.now();

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
        // Reset slug cache for this transaction
        this.slugCache.clear();

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
        const festival = await tx.event.create({
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

      const duration = Date.now() - startTime;
      logger.info('Festival import completed successfully', {
        festivalId: importResult.festivalId,
        stats: importResult.stats,
        performance: {
          durationMs: duration,
          operationsPerSecond: (
            (importResult.stats.venuesCreated +
             importResult.stats.teachersCreated +
             importResult.stats.musiciansCreated +
             importResult.stats.pricesCreated +
             importResult.stats.tagsCreated) / (duration / 1000)
          ).toFixed(2),
        },
      });

      return result;

    } catch (error) {
      const dbError = error instanceof BaseError ? error : new DatabaseError(
        error instanceof Error ? error.message : 'Database import failed',
        {
          cause: error instanceof Error ? error : undefined,
          context: { festivalName: data.name },
        }
      );

      logger.error('Festival import failed', {
        error: ErrorUtils.formatForLogging(dbError)
      });

      result.errors.push(dbError.message);
      return result;
    }
  }

  private async createOrUpdateVenue(
    tx: Prisma.TransactionClient,
    venueData: FestivalData['venue'],
    options: { geocode?: boolean }
  ): Promise<string> {
    // Check for existing venue by name and location
    const existingVenue = await tx.venue.findFirst({
      where: {
        name: {
          equals: venueData!.name,
          mode: 'insensitive',
        },
        city: {
          equals: venueData!.city,
          mode: 'insensitive',
        },
      },
    });

    if (existingVenue) {
      logger.info('Using existing venue', { venueId: existingVenue.id, name: existingVenue.name });
      return existingVenue.id;
    }

    // Geocode if requested and coordinates not provided
    let latitude = venueData!.latitude;
    let longitude = venueData!.longitude;

    if (options.geocode && (!latitude || !longitude) && venueData!.address && venueData!.city) {
      try {
        const geocodeResult = await geocodingService.geocodeAddress(
          venueData!.address,
          venueData!.city,
          venueData!.country
        );

        if (geocodeResult.success && geocodeResult.latitude && geocodeResult.longitude) {
          latitude = geocodeResult.latitude;
          longitude = geocodeResult.longitude;
          logger.info('Venue geocoded successfully', {
            venueName: venueData!.name,
            latitude,
            longitude,
          });
        }
      } catch (error) {
        logger.warn('Venue geocoding failed', { venueName: venueData!.name, error });
      }
    }

    // Generate slug
    const slug = await this.generateUniqueSlug(venueData!.name, 'venues', tx);

    // Create new venue
    const venue = await tx.venue.create({
      data: {
        name: venueData!.name,
        slug,
        address: venueData!.address || null,
        city: venueData!.city,
        state: venueData!.state || null,
        country: venueData!.country,
        postalCode: venueData!.postalCode || null,
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
    tx: Prisma.TransactionClient,
    teachers: FestivalData['teachers'],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    if (!teachers) return;

    // Batch process: Find all existing teachers in a single query
    const teacherNames = teachers.map(t => t.name);
    const existingTeachers = await tx.teacher.findMany({
      where: {
        name: {
          in: teacherNames,
          mode: 'insensitive',
        },
      },
    });

    const existingTeacherMap = new Map(
      existingTeachers.map(t => [t.name.toLowerCase(), t])
    );

    // Batch process: Prepare all operations
    const teachersToCreate: typeof teachers = [];
    const eventTeacherRelations: Array<{
      teacherId: string;
      teacherData: typeof teachers[0];
    }> = [];

    for (const teacherData of teachers) {
      const teacherNameLower = teacherData.name.toLowerCase();
      const existingTeacher = existingTeacherMap.get(teacherNameLower);

      if (existingTeacher) {
        // Use existing teacher
        eventTeacherRelations.push({
          teacherId: existingTeacher.id,
          teacherData,
        });

        // Queue specialty updates
        if (teacherData.specialties && teacherData.specialties.length > 0) {
          await this.updateTeacherSpecialties(tx, existingTeacher.id, teacherData.specialties);
        }
      } else {
        // Mark for creation
        teachersToCreate.push(teacherData);
      }
    }

    // Batch create new teachers
    if (teachersToCreate.length > 0) {
      const teacherCreatePromises = teachersToCreate.map(async (teacherData) => {
        const slug = await this.generateUniqueSlug(teacherData.name, 'teachers', tx);

        return tx.teacher.create({
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
      });

      const createdTeachers = await Promise.all(teacherCreatePromises);
      stats.teachersCreated += createdTeachers.length;

      // Prepare event relations for newly created teachers
      for (let i = 0; i < createdTeachers.length; i++) {
        eventTeacherRelations.push({
          teacherId: createdTeachers[i].id,
          teacherData: teachersToCreate[i],
        });

        // Create specializations for new teachers
        const specialties = teachersToCreate[i].specialties;
        if (specialties && specialties.length > 0) {
          await this.createTeacherSpecialties(tx, createdTeachers[i].id, specialties);
        }
      }
    }

    // Batch create event-teacher relationships
    if (eventTeacherRelations.length > 0) {
      await tx.eventTeacher.createMany({
        data: eventTeacherRelations.map(rel => ({
          eventId: festivalId,
          teacherId: rel.teacherId,
          role: null,
          workshops: [],
          level: null,
        })),
        skipDuplicates: true,
      });
    }
  }

  private async createMusiciansAndRelations(
    tx: Prisma.TransactionClient,
    musicians: FestivalData['musicians'],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    if (!musicians) return;

    // Batch process: Find all existing musicians in a single query
    const musicianNames = musicians.map(m => m.name);
    const existingMusicians = await tx.musician.findMany({
      where: {
        name: {
          in: musicianNames,
          mode: 'insensitive',
        },
      },
    });

    const existingMusicianMap = new Map(
      existingMusicians.map(m => [m.name.toLowerCase(), m])
    );

    // Batch process: Prepare all operations
    const musiciansToCreate: typeof musicians = [];
    const eventMusicianRelations: Array<{
      musicianId: string;
      musicianData: typeof musicians[0];
    }> = [];

    for (const musicianData of musicians) {
      const musicianNameLower = musicianData.name.toLowerCase();
      const existingMusician = existingMusicianMap.get(musicianNameLower);

      if (existingMusician) {
        // Use existing musician
        eventMusicianRelations.push({
          musicianId: existingMusician.id,
          musicianData,
        });

        // Queue genre updates
        if (musicianData.genre && musicianData.genre.length > 0) {
          await this.updateMusicianGenres(tx, existingMusician.id, musicianData.genre);
        }
      } else {
        // Mark for creation
        musiciansToCreate.push(musicianData);
      }
    }

    // Batch create new musicians
    if (musiciansToCreate.length > 0) {
      const musicianCreatePromises = musiciansToCreate.map(async (musicianData) => {
        const slug = await this.generateUniqueSlug(musicianData.name, 'musicians', tx);

        return tx.musician.create({
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
      });

      const createdMusicians = await Promise.all(musicianCreatePromises);
      stats.musiciansCreated += createdMusicians.length;

      // Prepare event relations for newly created musicians
      for (let i = 0; i < createdMusicians.length; i++) {
        eventMusicianRelations.push({
          musicianId: createdMusicians[i].id,
          musicianData: musiciansToCreate[i],
        });

        // Create genres for new musicians
        const genres = musiciansToCreate[i].genre;
        if (genres && genres.length > 0) {
          await this.createMusicianGenres(tx, createdMusicians[i].id, genres);
        }
      }
    }

    // Batch create event-musician relationships
    if (eventMusicianRelations.length > 0) {
      await tx.eventMusician.createMany({
        data: eventMusicianRelations.map(rel => ({
          eventId: festivalId,
          musicianId: rel.musicianId,
          role: null,
          setTimes: [],
        })),
        skipDuplicates: true,
      });
    }
  }

  private async createPrices(
    tx: Prisma.TransactionClient,
    prices: FestivalData['prices'],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    if (!prices) return;

    // Batch create all prices
    try {
      const priceData = prices.map(price => ({
        eventId: festivalId,
        type: price.type.toUpperCase(),
        amount: price.amount,
        currency: price.currency,
        deadline: price.deadline ? new Date(price.deadline) : null,
        description: price.description || null,
        available: true,
      }));

      await tx.eventPrice.createMany({
        data: priceData,
        skipDuplicates: true,
      });

      stats.pricesCreated += priceData.length;
    } catch (error) {
      logger.error('Failed to batch create prices', {
        festivalId,
        priceCount: prices.length,
        error,
      });
    }
  }

  private async createTags(
    tx: Prisma.TransactionClient,
    tags: string[],
    festivalId: string,
    stats: DatabaseImportResult['stats']
  ): Promise<void> {
    if (!tags) return;

    // Batch create all tags
    try {
      const tagData = tags.map(tag => ({
        eventId: festivalId,
        tag: tag.toLowerCase(),
      }));

      await tx.eventTag.createMany({
        data: tagData,
        skipDuplicates: true,
      });

      stats.tagsCreated += tagData.length;
    } catch (error) {
      logger.error('Failed to batch create tags', {
        festivalId,
        tagCount: tags.length,
        error,
      });
    }
  }

  // Cache for generated slugs within a transaction
  private slugCache = new Map<string, Set<string>>();

  private async generateUniqueSlug(
    baseName: string,
    table: 'events' | 'venues' | 'teachers' | 'musicians',
    tx: Prisma.TransactionClient
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

    // Check cache first
    const cacheKey = table;
    if (!this.slugCache.has(cacheKey)) {
      this.slugCache.set(cacheKey, new Set());
    }
    const usedSlugs = this.slugCache.get(cacheKey)!;

    // Check for uniqueness and add number if needed
    let counter = 1;
    let finalSlug = slug;
    let isUnique = false;

    while (!isUnique) {
      // Check cache first
      if (usedSlugs.has(finalSlug)) {
        counter++;
        finalSlug = `${slug}-${counter}`;
        continue;
      }

      try {
        // Check if slug exists using the correct Prisma table names
        let existing;
        switch (table) {
          case 'events':
            existing = await tx.event.findUnique({ where: { slug: finalSlug } });
            break;
          case 'venues':
            existing = await tx.venue.findUnique({ where: { slug: finalSlug } });
            break;
          case 'teachers':
            existing = await tx.teacher.findUnique({ where: { slug: finalSlug } });
            break;
          case 'musicians':
            existing = await tx.musician.findUnique({ where: { slug: finalSlug } });
            break;
        }

        if (!existing) {
          isUnique = true;
          usedSlugs.add(finalSlug);
        } else {
          counter++;
          finalSlug = `${slug}-${counter}`;
        }
      } catch (error) {
        // If query fails, assume it's unique
        isUnique = true;
        usedSlugs.add(finalSlug);
      }
    }

    return finalSlug;
  }

  private async createTeacherSpecialties(
    tx: Prisma.TransactionClient,
    teacherId: string,
    specialties: string[]
  ): Promise<void> {
    // Batch create all specialties
    try {
      const specialtyData = specialties.map(specialty => ({
        teacherId,
        specialty: specialty.toLowerCase(),
      }));

      await tx.teacherSpecialty.createMany({
        data: specialtyData,
        skipDuplicates: true,
      });
    } catch (error) {
      logger.error('Failed to batch create teacher specialties', {
        teacherId,
        specialtyCount: specialties.length,
        error,
      });
    }
  }

  private async updateTeacherSpecialties(
    tx: Prisma.TransactionClient,
    teacherId: string,
    specialties: string[]
  ): Promise<void> {
    // Delete existing specialties
    await tx.teacherSpecialty.deleteMany({
      where: { teacherId },
    });

    // Create new specialties
    await this.createTeacherSpecialties(tx, teacherId, specialties);
  }

  private async createMusicianGenres(
    tx: Prisma.TransactionClient,
    musicianId: string,
    genres: string[]
  ): Promise<void> {
    // Batch create all genres
    try {
      const genreData = genres.map(genre => ({
        musicianId,
        genre: genre.toLowerCase(),
      }));

      await tx.musicianGenre.createMany({
        data: genreData,
        skipDuplicates: true,
      });
    } catch (error) {
      logger.error('Failed to batch create musician genres', {
        musicianId,
        genreCount: genres.length,
        error,
      });
    }
  }

  private async updateMusicianGenres(
    tx: Prisma.TransactionClient,
    musicianId: string,
    genres: string[]
  ): Promise<void> {
    // Delete existing genres
    await tx.musicianGenre.deleteMany({
      where: { musicianId },
    });

    // Create new genres
    await this.createMusicianGenres(tx, musicianId, genres);
  }
}

export const databaseService = new DatabaseService();