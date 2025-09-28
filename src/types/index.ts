export interface VenueData {
  name: string;
  city: string;
  country: string;
  address?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface TeacherData {
  name: string;
  bio?: string;
  specializations?: string[];
  website?: string;
  imageUrl?: string;
  aiRelevanceScore?: number;
}

export interface MusicianData {
  name: string;
  bio?: string;
  genre?: string[];
  instruments?: string[];
  website?: string;
  imageUrl?: string;
}

export interface PriceData {
  type: string;
  amount: number;
  currency: string;
  deadline?: Date | string;
  description?: string;
}

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}

export interface FestivalData {
  name: string;
  description?: string;
  startDate: Date | string;
  endDate: Date | string;
  timezone?: string;
  registrationDeadline?: Date | string;
  venue: VenueData;
  venues?: VenueData[];
  teachers?: TeacherData[];
  musicians?: MusicianData[];
  prices?: PriceData[];
  tags?: string[];
  website?: string;
  facebook?: string;
  instagram?: string;
  email?: string;
  phone?: string;
  registrationUrl?: string;
  sourceUrl?: string;
  imageUrl?: string;
  city?: string;
  country?: string;
}
