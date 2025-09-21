import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { FestivalData } from '@/types';

export interface DuplicateDetectionResult {
  hasDuplicates: boolean;
  duplicates: {
    festivals: DuplicateFestival[];
    venues: DuplicateVenue[];
    teachers: DuplicateTeacher[];
    musicians: DuplicateMusician[];
  };
  suggestions: DuplicateSuggestion[];
}

export interface DuplicateFestival {
  existingId: string;
  existingName: string;
  existingDates: { start: Date; end: Date };
  similarity: number;
  matchType: 'high' | 'medium' | 'low';
}

export interface DuplicateVenue {
  existingId: string;
  existingName: string;
  existingAddress: string;
  similarity: number;
  matchType: 'high' | 'medium' | 'low';
}

export interface DuplicateTeacher {
  existingId: string;
  existingName: string;
  similarity: number;
  specialties: string[];
}

export interface DuplicateMusician {
  existingId: string;
  existingName: string;
  similarity: number;
  genres: string[];
}

export interface DuplicateSuggestion {
  type: 'merge' | 'skip' | 'update';
  entityType: 'festival' | 'venue' | 'teacher' | 'musician';
  confidence: number;
  reason: string;
}

export class DuplicateDetectionService {
  private readonly SIMILARITY_THRESHOLD = {
    EXACT: 0.95,
    HIGH: 0.85,
    MEDIUM: 0.70,
    LOW: 0.50,
  };

  async detectDuplicates(data: FestivalData): Promise<DuplicateDetectionResult> {
    try {
      logger.info('Starting duplicate detection', {
        festivalName: data.name,
        startDate: data.startDate,
        endDate: data.endDate
      });

      const [festivalDuplicates, venueDuplicates, teacherDuplicates, musicianDuplicates] = await Promise.all([
        this.detectFestivalDuplicates(data),
        this.detectVenueDuplicates(data),
        this.detectTeacherDuplicates(data),
        this.detectMusicianDuplicates(data),
      ]);

      const hasDuplicates = [
        festivalDuplicates.length > 0,
        venueDuplicates.length > 0,
        teacherDuplicates.length > 0,
        musicianDuplicates.length > 0,
      ].some(Boolean);

      const suggestions = this.generateSuggestions({
        festivals: festivalDuplicates,
        venues: venueDuplicates,
        teachers: teacherDuplicates,
        musicians: musicianDuplicates,
      }, data);

      logger.info('Duplicate detection completed', {
        hasDuplicates,
        festivalDuplicates: festivalDuplicates.length,
        venueDuplicates: venueDuplicates.length,
        teacherDuplicates: teacherDuplicates.length,
        musicianDuplicates: musicianDuplicates.length,
      });

      return {
        hasDuplicates,
        duplicates: {
          festivals: festivalDuplicates,
          venues: venueDuplicates,
          teachers: teacherDuplicates,
          musicians: musicianDuplicates,
        },
        suggestions,
      };

    } catch (error) {
      logger.error('Duplicate detection failed', { error });
      return {
        hasDuplicates: false,
        duplicates: {
          festivals: [],
          venues: [],
          teachers: [],
          musicians: [],
        },
        suggestions: [],
      };
    }
  }

  private async detectFestivalDuplicates(data: FestivalData): Promise<DuplicateFestival[]> {
    const duplicates: DuplicateFestival[] = [];

    try {
      // Exact name match
      const exactMatches = await prisma.event.findMany({
        where: {
          name: {
            equals: data.name,
            mode: 'insensitive',
          },
        },
      });

      exactMatches.forEach((festival: { id: string; name: string; startDate: Date; endDate: Date }) => {
        duplicates.push({
          existingId: festival.id,
          existingName: festival.name,
          existingDates: {
            start: festival.startDate,
            end: festival.endDate,
          },
          similarity: 1.0,
          matchType: 'high',
        });
      });

      // Similar name match
      const similarNameMatches = await prisma.event.findMany({
        where: {
          AND: [
            {
              name: {
                contains: this.extractKeywords(data.name).join(' '),
                mode: 'insensitive',
              },
            },
            {
              id: {
                notIn: exactMatches.map(f => f.id),
              },
            },
          ],
        },
      });

      similarNameMatches.forEach(festival => {
        const similarity = this.calculateStringSimilarity(data.name, festival.name);
        if (similarity >= this.SIMILARITY_THRESHOLD.MEDIUM) {
          let matchType: 'high' | 'medium' | 'low' = 'medium';
          if (similarity >= this.SIMILARITY_THRESHOLD.HIGH) matchType = 'high';
          if (similarity >= this.SIMILARITY_THRESHOLD.EXACT) matchType = 'high';

          duplicates.push({
            existingId: festival.id,
            existingName: festival.name,
            existingDates: {
              start: festival.startDate,
              end: festival.endDate,
            },
            similarity,
            matchType,
          });
        }
      });

      // Date overlap detection
      if (data.startDate && data.endDate) {
        const startDate = new Date(data.startDate);
        const endDate = new Date(data.endDate);

        const dateOverlaps = await prisma.event.findMany({
          where: {
            AND: [
              {
                OR: [
                  {
                    AND: [
                      { startDate: { lte: endDate } },
                      { endDate: { gte: startDate } },
                    ],
                  },
                  {
                    AND: [
                      { startDate: { gte: startDate } },
                      { startDate: { lte: endDate } },
                    ],
                  },
                ],
              },
              {
                id: {
                  notIn: duplicates.map(d => d.existingId),
                },
              },
            ],
          },
        });

        dateOverlaps.forEach(festival => {
          const nameSimilarity = this.calculateStringSimilarity(data.name, festival.name);
          const dateOverlap = this.calculateDateOverlap(
            { start: startDate, end: endDate },
            { start: festival.startDate, end: festival.endDate }
          );

          const combinedSimilarity = (nameSimilarity * 0.6) + (dateOverlap * 0.4);

          if (combinedSimilarity >= this.SIMILARITY_THRESHOLD.LOW) {
            let matchType: 'high' | 'medium' | 'low' = 'low';
            if (combinedSimilarity >= this.SIMILARITY_THRESHOLD.MEDIUM) matchType = 'medium';
            if (combinedSimilarity >= this.SIMILARITY_THRESHOLD.HIGH) matchType = 'high';

            duplicates.push({
              existingId: festival.id,
              existingName: festival.name,
              existingDates: {
                start: festival.startDate,
                end: festival.endDate,
              },
              similarity: combinedSimilarity,
              matchType,
            });
          }
        });
      }

      return duplicates;

    } catch (error) {
      logger.error('Festival duplicate detection failed', { error });
      return [];
    }
  }

  private async detectVenueDuplicates(data: FestivalData): Promise<DuplicateVenue[]> {
    const duplicates: DuplicateVenue[] = [];

    if (!data.venue?.name) return duplicates;

    try {
      // Exact name match
      const exactMatches = await prisma.venue.findMany({
        where: {
          name: {
            equals: data.venue.name,
            mode: 'insensitive',
          },
        },
      });

      exactMatches.forEach(venue => {
        duplicates.push({
          existingId: venue.id,
          existingName: venue.name,
          existingAddress: venue.address || '',
          similarity: 1.0,
          matchType: 'high',
        });
      });

      // Similar name match
      const similarNameMatches = await prisma.venue.findMany({
        where: {
          AND: [
            {
              name: {
                contains: this.extractKeywords(data.venue.name).join(' '),
                mode: 'insensitive',
              },
            },
            {
              id: {
                notIn: exactMatches.map(v => v.id),
              },
            },
          ],
        },
      });

      similarNameMatches.forEach(venue => {
        const similarity = this.calculateStringSimilarity(data.venue?.name || '', venue.name);
        if (similarity >= this.SIMILARITY_THRESHOLD.MEDIUM) {
          let matchType: 'high' | 'medium' = 'medium';
          if (similarity >= this.SIMILARITY_THRESHOLD.HIGH) matchType = 'high';

          duplicates.push({
            existingId: venue.id,
            existingName: venue.name,
            existingAddress: venue.address || '',
            similarity,
            matchType,
          });
        }
      });

      // Address match
      if (data.venue.address) {
        const addressMatches = await prisma.venue.findMany({
          where: {
            AND: [
              {
                address: {
                  contains: this.extractKeywords(data.venue.address).join(' '),
                  mode: 'insensitive',
                },
              },
              {
                id: {
                  notIn: duplicates.map(d => d.existingId),
                },
              },
            ],
          },
        });

        addressMatches.forEach(venue => {
          const similarity = this.calculateStringSimilarity(data.venue?.address || '', venue.address || '');
          if (similarity >= this.SIMILARITY_THRESHOLD.HIGH) {
            duplicates.push({
              existingId: venue.id,
              existingName: venue.name,
              existingAddress: venue.address || '',
              similarity,
              matchType: 'high',
            });
          }
        });
      }

      return duplicates;

    } catch (error) {
      logger.error('Venue duplicate detection failed', { error });
      return [];
    }
  }

  private async detectTeacherDuplicates(data: FestivalData): Promise<DuplicateTeacher[]> {
    const duplicates: DuplicateTeacher[] = [];

    if (!data.teachers || data.teachers.length === 0) return duplicates;

    try {
      for (const teacher of data.teachers) {
        // Exact name match
        const exactMatches = await prisma.teacher.findMany({
          where: {
            name: {
              equals: teacher.name,
              mode: 'insensitive',
            },
          },
        });

        exactMatches.forEach(existingTeacher => {
          duplicates.push({
            existingId: existingTeacher.id,
            existingName: existingTeacher.name,
            similarity: 1.0,
            specialties: existingTeacher.specializations || [],
          });
        });

        // Similar name match
        const similarNameMatches = await prisma.teacher.findMany({
          where: {
            AND: [
              {
                name: {
                  contains: this.extractKeywords(teacher.name).join(' '),
                  mode: 'insensitive',
                },
              },
              {
                id: {
                  notIn: exactMatches.map(t => t.id),
                },
              },
            ],
          },
        });

        similarNameMatches.forEach(existingTeacher => {
          const similarity = this.calculateStringSimilarity(teacher.name, existingTeacher.name);
          if (similarity >= this.SIMILARITY_THRESHOLD.MEDIUM) {
            duplicates.push({
              existingId: existingTeacher.id,
              existingName: existingTeacher.name,
              similarity,
              specialties: existingTeacher.specializations || [],
            });
          }
        });
      }

      return duplicates;

    } catch (error) {
      logger.error('Teacher duplicate detection failed', { error });
      return [];
    }
  }

  private async detectMusicianDuplicates(data: FestivalData): Promise<DuplicateMusician[]> {
    const duplicates: DuplicateMusician[] = [];

    if (!data.musicians || data.musicians.length === 0) return duplicates;

    try {
      for (const musician of data.musicians) {
        // Exact name match
        const exactMatches = await prisma.musician.findMany({
          where: {
            name: {
              equals: musician.name,
              mode: 'insensitive',
            },
          },
        });

        exactMatches.forEach(existingMusician => {
          duplicates.push({
            existingId: existingMusician.id,
            existingName: existingMusician.name,
            similarity: 1.0,
            genres: [], // TODO: Query musician_genres table
          });
        });

        // Similar name match
        const similarNameMatches = await prisma.musician.findMany({
          where: {
            AND: [
              {
                name: {
                  contains: this.extractKeywords(musician.name).join(' '),
                  mode: 'insensitive',
                },
              },
              {
                id: {
                  notIn: exactMatches.map(m => m.id),
                },
              },
            ],
          },
        });

        similarNameMatches.forEach(existingMusician => {
          const similarity = this.calculateStringSimilarity(musician.name, existingMusician.name);
          if (similarity >= this.SIMILARITY_THRESHOLD.MEDIUM) {
            duplicates.push({
              existingId: existingMusician.id,
              existingName: existingMusician.name,
              similarity,
              genres: [], // TODO: Query musician_genres table
            });
          }
        });
      }

      return duplicates;

    } catch (error) {
      logger.error('Musician duplicate detection failed', { error });
      return [];
    }
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const normalized1 = str1.toLowerCase().trim();
    const normalized2 = str2.toLowerCase().trim();

    if (normalized1 === normalized2) return 1.0;

    // Levenshtein distance based similarity
    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);

    if (maxLength === 0) return 1.0;

    return 1.0 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i += 1) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j += 1) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator, // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private calculateDateOverlap(
    dates1: { start: Date; end: Date },
    dates2: { start: Date; end: Date }
  ): number {
    const overlapStart = new Date(Math.max(dates1.start.getTime(), dates2.start.getTime()));
    const overlapEnd = new Date(Math.min(dates1.end.getTime(), dates2.end.getTime()));

    if (overlapStart > overlapEnd) return 0.0;

    const overlapDuration = overlapEnd.getTime() - overlapStart.getTime();
    const totalDuration = Math.min(
      dates1.end.getTime() - dates1.start.getTime(),
      dates2.end.getTime() - dates2.start.getTime()
    );

    return totalDuration > 0 ? overlapDuration / totalDuration : 0.0;
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'with', 'festival', 'swing', 'blues'].includes(word));
  }

  private generateSuggestions(
    duplicates: DuplicateDetectionResult['duplicates'],
    data: FestivalData
  ): DuplicateSuggestion[] {
    const suggestions: DuplicateSuggestion[] = [];

    // Festival duplicates
    duplicates.festivals.forEach(duplicate => {
      if (duplicate.matchType === 'high') {
        suggestions.push({
          type: 'skip',
          entityType: 'festival',
          confidence: 0.95,
          reason: `Exact match found: "${duplicate.existingName}"`,
        });
      } else if (duplicate.matchType === 'medium') {
        suggestions.push({
          type: 'merge',
          entityType: 'festival',
          confidence: 0.8,
          reason: `High similarity match found: "${duplicate.existingName}" (${Math.round(duplicate.similarity * 100)}% similar)`,
        });
      }
    });

    // Venue duplicates
    duplicates.venues.forEach(duplicate => {
      if (duplicate.matchType === 'high') {
        suggestions.push({
          type: 'merge',
          entityType: 'venue',
          confidence: 0.9,
          reason: `Exact venue match found: "${duplicate.existingName}"`,
        });
      } else if (duplicate.matchType === 'medium') {
        suggestions.push({
          type: 'merge',
          entityType: 'venue',
          confidence: 0.7,
          reason: `High similarity venue match: "${duplicate.existingName}" (${Math.round(duplicate.similarity * 100)}% similar)`,
        });
      }
    });

    return suggestions;
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();