// Core festival data types
export interface FestivalData {
  name: string;
  description?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
  email?: string;
  phone?: string;

  startDate: Date;
  endDate: Date;
  timezone?: string;

  location?: {
    venue?: string;
    address?: string;
    city?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };

  artists?: ArtistData[];
  workshops?: WorkshopData[];
  socialEvents?: SocialEventData[];
}

export interface ArtistData {
  name: string;
  bio?: string;
  website?: string;
  facebook?: string;
  instagram?: string;
}

export interface WorkshopData {
  title: string;
  description?: string;
  level?: string;
  startTime: Date;
  endTime: Date;
  artist?: string;
}

export interface SocialEventData {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  eventType?: string;
}

// API types
export interface ScrapingRequest {
  url: string;
  confidenceThreshold?: number;
}

export interface ScrapingResponse {
  success: boolean;
  data?: FestivalData;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId: string;
    confidence: number;
  };
}

// Error types
export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E };
