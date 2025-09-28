'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FestivalData } from '@/types';
import { formatDate } from '@/lib/date-utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface FestivalDetailProps {
  festivalId: string;
}

export default function FestivalDetail({ festivalId }: FestivalDetailProps) {
  const [festival, setFestival] = useState<FestivalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const fetchFestival = async () => {
      try {
        const response = await fetch(`/api/festival/${festivalId}`);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Festival not found');
          }
          throw new Error('Failed to fetch festival details');
        }

        const data = await response.json();
        if (data.success) {
          setFestival(data.data);
        } else {
          throw new Error(data.error || 'Failed to fetch festival details');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchFestival();
  }, [festivalId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading festival details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!festival) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Festival Not Found</h2>
          <p className="text-gray-600 mb-6">The festival you're looking for doesn't exist.</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="text-blue-600 hover:text-blue-800 transition-colors"
              >
                ← Back to Home
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Festival Details</h1>
                <p className="text-sm text-gray-600">SwingRadar Data Import System</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Festival Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">{festival.name}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
              <span className="flex items-center">
                📅 {formatDate(festival.startDate)} - {formatDate(festival.endDate)}
              </span>
              {festival.timezone && (
                <span className="flex items-center">
                  🌐 {festival.timezone}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {festival.description && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Description</h3>
              <div className="prose max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap">{festival.description}</p>
              </div>
            </div>
          )}

          {/* Venue Information */}
          {(festival.venue || (festival.venues && festival.venues.length > 0)) && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {festival.venues && festival.venues.length > 1 ? 'Venues' : 'Venue'}
              </h3>

              {/* Show multiple venues if available */}
              {festival.venues && festival.venues.length > 0 ? (
                <div className="space-y-3">
                  {festival.venues.map((venue, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-md">
                      <h4 className="font-medium text-gray-900 mb-2">
                        {venue.name}
                        {index === 0 && festival.venues && festival.venues.length > 1 && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Primary
                          </span>
                        )}
                      </h4>
                      {venue.address && (
                        <p className="text-gray-600 mb-1">{venue.address}</p>
                      )}
                      <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                        {venue.city && <span>{venue.city}</span>}
                        {venue.state && <span>{venue.state}</span>}
                        {venue.country && <span>{venue.country}</span>}
                        {venue.postalCode && <span>{venue.postalCode}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Show single venue for backward compatibility */
                festival.venue && (
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="font-medium text-gray-900 mb-2">{festival.venue.name}</h4>
                    {festival.venue.address && (
                      <p className="text-gray-600 mb-1">{festival.venue.address}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                      {festival.venue.city && <span>{festival.venue.city}</span>}
                      {festival.venue.state && <span>{festival.venue.state}</span>}
                      {festival.venue.country && <span>{festival.venue.country}</span>}
                      {festival.venue.postalCode && <span>{festival.venue.postalCode}</span>}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Teachers */}
          {festival.teachers && festival.teachers.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Teachers ({festival.teachers.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {festival.teachers.map((teacher, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-md">
                    <h4 className="font-medium text-gray-900 mb-2">{teacher.name}</h4>
                    {teacher.bio && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-3">{teacher.bio}</p>
                    )}
                    {teacher.specializations && teacher.specializations.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {teacher.specializations.map((specialization, idx) => (
                          <span
                            key={idx}
                            className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded"
                          >
                            {specialization}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Musicians */}
          {festival.musicians && festival.musicians.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Musicians ({festival.musicians.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {festival.musicians.map((musician, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-md">
                    <h4 className="font-medium text-gray-900 mb-2">{musician.name}</h4>
                    {musician.bio && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-3">{musician.bio}</p>
                    )}
                    {musician.genre && musician.genre.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {musician.genre.map((genre, idx) => (
                          <span
                            key={idx}
                            className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded"
                          >
                            {genre}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prices */}
          {festival.prices && festival.prices.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Prices</h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {festival.prices.map((price, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-md">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium text-gray-900 capitalize">
                        {price.type.replace('_', ' ')}
                      </span>
                      <span className="text-lg font-bold text-gray-900">
                        {price.currency} {price.amount}
                      </span>
                    </div>
                    {price.deadline && (
                      <p className="text-sm text-gray-600">
                        Deadline: {formatDate(price.deadline)}
                      </p>
                    )}
                    {price.description && (
                      <p className="text-sm text-gray-600 mt-1">{price.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact Information */}
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-3">Contact Information</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {festival.website && (
                <div>
                  <span className="font-medium text-gray-700">Website:</span>
                  <a
                    href={festival.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 ml-2"
                  >
                    {festival.website}
                  </a>
                </div>
              )}
              {festival.email && (
                <div>
                  <span className="font-medium text-gray-700">Email:</span>
                  <a
                    href={`mailto:${festival.email}`}
                    className="text-blue-600 hover:text-blue-800 ml-2"
                  >
                    {festival.email}
                  </a>
                </div>
              )}
              {festival.phone && (
                <div>
                  <span className="font-medium text-gray-700">Phone:</span>
                  <span className="text-gray-600 ml-2">{festival.phone}</span>
                </div>
              )}
              {festival.facebook && (
                <div>
                  <span className="font-medium text-gray-700">Facebook:</span>
                  <a
                    href={festival.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 ml-2"
                  >
                    Facebook
                  </a>
                </div>
              )}
              {festival.instagram && (
                <div>
                  <span className="font-medium text-gray-700">Instagram:</span>
                  <a
                    href={festival.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 ml-2"
                  >
                    Instagram
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {festival.tags && festival.tags.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {festival.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-block bg-purple-100 text-purple-800 text-sm px-3 py-1 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}