'use client';

import React, { useMemo } from 'react';
import {
  CheckCircle,
  Download,
  Share,
  Calendar,
  MapPin,
  Users,
  Music,
  DollarSign,
  ExternalLink,
  FileText,
  Copy,
  Mail,
  BarChart3
} from 'lucide-react';
import { FestivalData } from '@/types';
import {
  formatDate,
  formatDuration,
  calculateDataCompleteness
} from '@/utils/validation-helpers';

interface SuccessConfirmationProps {
  data: FestivalData;
  confidence: number;
  importId?: string;
  processingTime?: number;
  onExport?: (format: 'json' | 'csv' | 'pdf') => void;
  onShare?: () => void;
  onContinue?: () => void;
  showDetails?: boolean;
}

const SuccessConfirmation: React.FC<SuccessConfirmationProps> = ({
  data,
  confidence,
  importId,
  processingTime,
  onExport,
  onShare,
  onContinue,
  showDetails = true
}) => {
  const stats = useMemo(() => {
    return {
      teacherCount: data.teachers?.length || 0,
      musicianCount: data.musicians?.length || 0,
      priceCount: data.prices?.length || 0,
      hasVenue: !!data.venue,
      hasLocation: !!(data.venue && (data.venue.city || data.venue.country)),
      completeness: calculateDataCompleteness(data)
    };
  }, [data]);

  const handleExport = (format: 'json' | 'csv' | 'pdf') => {
    if (onExport) {
      onExport(format);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-green-800">
                Import Successful!
              </h3>
              <p className="text-green-600">
                Festival data has been successfully processed and imported
              </p>
            </div>
          </div>

          <div className={`px-4 py-3 rounded-lg ${getConfidenceBg(confidence)}`}>
            <div className="text-right">
              <div className={`text-xl font-bold ${getConfidenceColor(confidence)}`}>
                {Math.round(confidence * 100)}%
              </div>
              <div className={`text-xs ${getConfidenceColor(confidence)}`}>
                Confidence Score
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.teacherCount}</div>
            <div className="text-xs text-gray-600">Teachers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.musicianCount}</div>
            <div className="text-xs text-gray-600">Musicians</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.priceCount}</div>
            <div className="text-xs text-gray-600">Price Options</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.completeness}%</div>
            <div className="text-xs text-gray-600">Complete</div>
          </div>
        </div>
      </div>

      {/* Festival Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <Calendar className="w-5 h-5 mr-2" />
          Festival Summary
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Basic Info */}
          <div className="space-y-3">
            <div>
              <h5 className="font-semibold text-gray-800 text-lg">{data.name}</h5>
              {data.description && (
                <p className="text-gray-600 text-sm mt-1">{data.description}</p>
              )}
            </div>

            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Calendar className="w-4 h-4" />
              <span>
                {formatDate(data.startDate)} - {formatDate(data.endDate)}
                <span className="ml-2 text-gray-400">({formatDuration(data.startDate, data.endDate)})</span>
              </span>
            </div>

            {data.timezone && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span className="w-4 h-4 bg-gray-300 rounded"></span>
                <span>{data.timezone}</span>
              </div>
            )}

            {data.registrationDeadline && (
              <div className="flex items-center space-x-2 text-sm text-orange-600">
                <Calendar className="w-4 h-4" />
                <span>Registration deadline: {formatDate(data.registrationDeadline)}</span>
              </div>
            )}
          </div>

          {/* Location & Links */}
          <div className="space-y-3">
            {data.venue && (
              <div>
                <div className="flex items-center space-x-2 text-sm text-gray-600 mb-1">
                  <MapPin className="w-4 h-4" />
                  <span className="font-medium">Venue</span>
                </div>
                <div className="text-sm text-gray-700 ml-6">
                  <div className="font-medium">{data.venue.name}</div>
                  {data.venue.address && <div>{data.venue.address}</div>}
                  {data.venue.city && data.venue.country && (
                    <div>{data.venue.city}, {data.venue.country}</div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {data.website && (
                <a
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Website</span>
                </a>
              )}

              {data.registrationUrl && (
                <a
                  href={data.registrationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-sm text-green-600 hover:text-green-800"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Registration</span>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* People Section */}
        {(stats.teacherCount > 0 || stats.musicianCount > 0) && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {stats.teacherCount > 0 && (
                <div>
                  <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4" />
                    <span>Teachers ({stats.teacherCount})</span>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-6">
                    {data.teachers?.slice(0, 6).map((teacher, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                      >
                        {teacher.name}
                      </span>
                    ))}
                    {stats.teacherCount > 6 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        +{stats.teacherCount - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {stats.musicianCount > 0 && (
                <div>
                  <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
                    <Music className="w-4 h-4" />
                    <span>Musicians ({stats.musicianCount})</span>
                  </div>
                  <div className="flex flex-wrap gap-2 ml-6">
                    {data.musicians?.slice(0, 6).map((musician, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded"
                      >
                        {musician.name}
                      </span>
                    ))}
                    {stats.musicianCount > 6 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                        +{stats.musicianCount - 6} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pricing */}
        {stats.priceCount > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center space-x-2 text-sm font-medium text-gray-700 mb-2">
              <DollarSign className="w-4 h-4" />
              <span>Pricing Options ({stats.priceCount})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 ml-6">
              {data.prices?.map((price, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                  <div className="font-medium text-gray-800">
                    {price.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                  <div className="text-gray-600">
                    {price.currency} {price.amount}
                    {price.deadline && (
                      <span className="text-xs text-orange-600 ml-1">
                        (until {formatDate(price.deadline)})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {data.tags && data.tags.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex flex-wrap gap-2">
              {data.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Processing Details */}
      {showDetails && (importId || processingTime) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Processing Details
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {importId && (
              <div>
                <span className="text-gray-600">Import ID:</span>
                <div className="font-mono text-xs bg-gray-100 px-2 py-1 rounded mt-1">
                  {importId}
                </div>
              </div>
            )}
            {processingTime && (
              <div>
                <span className="text-gray-600">Processing Time:</span>
                <div className="font-medium">{processingTime}ms</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {onExport && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Export as:</span>
            {(['json', 'csv', 'pdf'] as const).map(format => (
              <button
                key={format}
                onClick={() => handleExport(format)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span className="uppercase">{format}</span>
              </button>
            ))}
          </div>
        )}

        {onShare && (
          <button
            onClick={onShare}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <Share className="w-4 h-4" />
            <span>Share</span>
          </button>
        )}

        {onContinue && (
          <button
            onClick={onContinue}
            className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Continue</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default SuccessConfirmation;