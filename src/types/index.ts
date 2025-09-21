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
  registrationDeadline?: Date;
  registrationUrl?: string;
  sourceUrl?: string;

  venue?: VenueData;
  teachers?: TeacherData[];
  musicians?: MusicianData[];
  prices?: PriceData[];
  tags?: string[];
}

export interface VenueData {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface TeacherData {
  name: string;
  specialties?: string[];
}

export interface MusicianData {
  name: string;
  genre?: string[];
}

export interface PriceData {
  type: string;
  amount: number;
  currency: string;
  deadline?: Date;
  description?: string;
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
