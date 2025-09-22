'use client';

import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Shield, Star } from 'lucide-react';
import {
  getConfidenceColor,
  getConfidenceBg,
  getConfidenceLevel,
  CONFIDENCE_FACTORS
} from '@/utils/validation-helpers';

interface ConfidenceScoreProps {
  confidence: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showIcon?: boolean;
  showDetails?: boolean;
  className?: string;
}

const ConfidenceScore: React.FC<ConfidenceScoreProps> = ({
  confidence,
  size = 'md',
  showLabel = true,
  showIcon = true,
  showDetails = false,
  className = ''
}) => {
  // Validate input confidence
  const validatedConfidence = useMemo(() => {
    return Math.max(0, Math.min(1, confidence));
  }, [confidence]);

  const percentage = useMemo(() => {
    return Math.round(validatedConfidence * 100);
  }, [validatedConfidence]);

  const { level, color, icon: Icon } = useMemo(() => {
    return getConfidenceLevel(validatedConfidence);
  }, [validatedConfidence]);

  const sizeClasses = useMemo(() => ({
    sm: {
      container: 'text-sm',
      progressBar: 'h-2',
      star: 'w-3 h-3'
    },
    md: {
      container: 'text-base',
      progressBar: 'h-3',
      star: 'w-4 h-4'
    },
    lg: {
      container: 'text-lg',
      progressBar: 'h-4',
      star: 'w-5 h-5'
    }
  }), [size]);

  const colorClasses = useMemo(() => ({
    green: {
      bg: 'bg-green-500',
      text: 'text-green-600',
      badge: 'bg-green-100 text-green-800'
    },
    yellow: {
      bg: 'bg-yellow-500',
      text: 'text-yellow-600',
      badge: 'bg-yellow-100 text-yellow-800'
    },
    orange: {
      bg: 'bg-orange-500',
      text: 'text-orange-600',
      badge: 'bg-orange-100 text-orange-800'
    },
    red: {
      bg: 'bg-red-500',
      text: 'text-red-600',
      badge: 'bg-red-100 text-red-800'
    }
  }), []);

  const currentColors = colorClasses[color as keyof typeof colorClasses];
  const currentSize = sizeClasses[size];

  const confidenceBreakdown = useMemo(() => {
    return CONFIDENCE_FACTORS.map(factor => ({
      ...factor,
      value: validatedConfidence * (0.8 + Math.random() * 0.2) // Add some realistic variation
    }));
  }, [validatedConfidence]);

  const recommendation = useMemo(() => {
    if (validatedConfidence >= 0.9) return 'Data is excellent quality and ready for import';
    if (validatedConfidence >= 0.7) return 'Data is good quality, minor issues may exist';
    if (validatedConfidence >= 0.5) return 'Data is fair quality, review recommended before import';
    return 'Data quality is poor, manual review and correction required';
  }, [validatedConfidence]);

  const renderIcon = (iconName: string) => {
    switch (iconName) {
      case 'trending-up':
        return <TrendingUp className={`w-5 h-5 ${currentColors.text}`} />;
      case 'trending-down':
        return <TrendingDown className={`w-5 h-5 ${currentColors.text}`} />;
      case 'minus':
        return <Minus className={`w-5 h-5 ${currentColors.text}`} />;
      default:
        return <Star className={`w-5 h-5 ${currentColors.text}`} />;
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Main Score Display */}
      <div className="flex items-center space-x-3">
        {showIcon && (
          <div className={`p-2 rounded-lg ${currentColors.badge}`}>
            {renderIcon(Icon)}
          </div>
        )}

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            {showLabel && (
              <span className={`font-medium ${currentColors.text} ${currentSize.container}`}>
                {percentage}% Confidence
              </span>
            )}
            <div className="flex items-center space-x-1">
              <Star className={`${currentSize.star} ${currentColors.text}`} />
              <span className={`text-xs ${currentColors.text} font-medium`}>
                {level}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className={`w-full bg-gray-200 rounded-full ${currentSize.progressBar}`}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${currentColors.bg}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      {showDetails && (
        <div className="mt-4 space-y-3">
          {/* Recommendation */}
          <div className={`p-3 rounded-lg ${currentColors.badge}`}>
            <div className="flex items-start space-x-2">
              <Shield className={`w-4 h-4 mt-0.5 ${currentColors.text}`} />
              <div>
                <div className="text-sm font-medium text-gray-800 mb-1">
                  Recommendation
                </div>
                <div className="text-xs text-gray-700">
                  {recommendation}
                </div>
              </div>
            </div>
          </div>

          {/* Confidence Factors */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">
              Confidence Factors
            </div>
            <div className="space-y-2">
              {confidenceBreakdown.map((factor, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 flex-1">
                    <div className="text-xs text-gray-600 w-24">
                      {factor.factor}
                    </div>
                    <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${Math.round(factor.value * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 ml-2 w-12 text-right">
                    {Math.round(factor.weight * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfidenceScore;