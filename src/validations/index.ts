import { z } from 'zod';
import { FestivalData } from '@/types';

// Festival validation schema
export const festivalSchema = z
  .object({
    name: z.string().min(1, 'Festival name is required'),
    description: z.string().optional(),
    website: z.string().url('Invalid website URL').optional().or(z.literal('')),
    facebook: z
      .string()
      .url('Invalid Facebook URL')
      .optional()
      .or(z.literal('')),
    instagram: z
      .string()
      .url('Invalid Instagram URL')
      .optional()
      .or(z.literal('')),
    email: z
      .string()
      .email('Invalid email address')
      .optional()
      .or(z.literal('')),
    phone: z.string().optional(),

    startDate: z.date({
      message: 'Invalid start date',
    }),
    endDate: z.date({
      message: 'Invalid end date',
    }),
    timezone: z.string().default('UTC'),

    location: z
      .object({
        venue: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        country: z.string().optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
      })
      .optional(),

    artists: z
      .array(
        z.object({
          name: z.string().min(1, 'Artist name is required'),
          bio: z.string().optional(),
          website: z.string().url().optional().or(z.literal('')),
          facebook: z.string().url().optional().or(z.literal('')),
          instagram: z.string().url().optional().or(z.literal('')),
        })
      )
      .optional(),

    workshops: z
      .array(
        z.object({
          title: z.string().min(1, 'Workshop title is required'),
          description: z.string().optional(),
          level: z
            .enum(['beginner', 'intermediate', 'advanced', 'mixed'])
            .optional(),
          startTime: z.date(),
          endTime: z.date(),
          artist: z.string().optional(),
        })
      )
      .optional(),

    socialEvents: z
      .array(
        z.object({
          title: z.string().min(1, 'Event title is required'),
          description: z.string().optional(),
          startTime: z.date(),
          endTime: z.date(),
          eventType: z.string().optional(),
        })
      )
      .optional(),
  })
  .refine(data => data.endDate >= data.startDate, {
    message: 'End date must be after or equal to start date',
    path: ['endDate'],
  });

// Request validation schemas
export const scrapingRequestSchema = z.object({
  url: z.string().url('Invalid URL'),
  confidenceThreshold: z.number().min(0).max(1).optional(),
});

// Type guards
export function isValidFestivalData(data: unknown): data is FestivalData {
  return festivalSchema.safeParse(data).success;
}

export function isValidScrapingRequest(data: unknown): data is ScrapingRequest {
  return scrapingRequestSchema.safeParse(data).success;
}

// Export types
export type ScrapingRequest = z.infer<typeof scrapingRequestSchema>;
export type ValidatedFestivalData = z.infer<typeof festivalSchema>;
