'use client';

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  FileText,
  Settings,
  Bug,
  Wifi,
  Shield,
  Clock,
  CheckCircle,
  Info
} from 'lucide-react';
import { getErrorInformation, getErrorSolutions, ErrorSolution } from '@/utils/validation-helpers';
import { sanitizeInput } from '@/utils/security-helpers';

interface ErrorReportProps {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp?: string;
    operation?: string;
    stack?: string;
    context?: Record<string, unknown>;
  };
  onRetry?: () => void;
  onReportIssue?: () => void;
  onFixManually?: () => void;
  showTechnicalDetails?: boolean;
  className?: string;
}

const ErrorReporting: React.FC<ErrorReportProps> = ({
  error,
  onRetry,
  onReportIssue,
  onFixManually,
  showTechnicalDetails = false,
  className = ''
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const sanitizedError = useMemo(() => ({
    ...error,
    message: sanitizeInput.string(error.message),
    code: sanitizeInput.string(error.code),
    operation: error.operation ? sanitizeInput.string(error.operation) : undefined
  }), [error]);

  const errorInfo = useMemo(() => {
    return getErrorInformation(sanitizedError.code, sanitizedError.message);
  }, [sanitizedError.code, sanitizedError.message]);

  const solutions = useMemo(() => {
    return getErrorSolutions(sanitizedError.code, sanitizedError.message, sanitizedError.details);
  }, [sanitizedError.code, sanitizedError.message, sanitizedError.details]);

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Error Header */}
      <div className={`p-4 rounded-lg border border-red-200 bg-red-50`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-red-100">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-800">
                {errorInfo.title}
              </h3>
              <p className="text-sm text-gray-700 mt-1">
                {errorInfo.description}
              </p>
              {error.timestamp && (
                <div className="flex items-center space-x-1 mt-2 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>{formatTimestamp(error.timestamp)}</span>
                </div>
              )}
            </div>
          </div>

          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors flex items-center space-x-1"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Solutions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {solutions.map((solution, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border-l-4 ${getPriorityColor(solution.priority)}`}
          >
            <div className="flex items-start space-x-2">
              <solution.icon className="w-5 h-5 mt-0.5 text-gray-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm mb-1">
                  {solution.action}
                </div>
                <div className="text-xs text-gray-600">
                  {solution.description}
                </div>
                {solution.steps && (
                  <div className="mt-2">
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {showDetails ? 'Hide steps' : 'Show steps'} →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Steps */}
      {showDetails && solutions.some(s => s.steps) && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
            <FileText className="w-5 h-5 mr-2" />
            Detailed Steps
          </h4>
          <div className="space-y-4">
            {solutions.map((solution, index) => {
              if (!solution.steps) return null;
              return (
                <div key={index}>
                  <div className="font-medium text-gray-700 mb-2">
                    {solution.action}
                  </div>
                  <ol className="space-y-2 ml-4">
                    {solution.steps.map((step, stepIndex) => (
                      <li key={stepIndex} className="text-sm text-gray-600 flex items-start">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-xs flex items-center justify-center mt-0.5 mr-2 flex-shrink-0">
                          {stepIndex + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Technical Details */}
      {showTechnicalDetails && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-800 flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Technical Details
            </h4>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {showDetails && (
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-700">Error Code:</span>
                <code className="ml-2 px-2 py-1 bg-gray-200 rounded text-xs">
                  {error.code}
                </code>
              </div>

              <div>
                <span className="font-medium text-gray-700">Operation:</span>
                <span className="ml-2 text-gray-600">{error.operation || 'Unknown'}</span>
              </div>

              {error.context && (
                <div>
                  <span className="font-medium text-gray-700">Context:</span>
                  <pre className="mt-1 p-2 bg-gray-800 text-gray-100 rounded text-xs overflow-x-auto">
                    {JSON.stringify(error.context, null, 2)}
                  </pre>
                </div>
              )}

              {error.stack && (
                <div>
                  <span className="font-medium text-gray-700">Stack Trace:</span>
                  <pre className="mt-1 p-2 bg-gray-800 text-gray-100 rounded text-xs overflow-x-auto font-mono">
                    {error.stack}
                  </pre>
                </div>
              )}

              {error.details && (
                <div>
                  <span className="font-medium text-gray-700">Additional Details:</span>
                  <pre className="mt-1 p-2 bg-gray-800 text-gray-100 rounded text-xs overflow-x-auto">
                    {JSON.stringify(error.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {onFixManually && (
          <button
            onClick={onFixManually}
            className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
          >
            <Settings className="w-4 h-4" />
            <span>Fix Manually</span>
          </button>
        )}

        {onReportIssue && (
          <button
            onClick={onReportIssue}
            className="px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors flex items-center space-x-2"
          >
            <Bug className="w-4 h-4" />
            <span>Report Issue</span>
          </button>
        )}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="px-4 py-2 bg-blue-100 text-blue-700 font-medium rounded-lg hover:bg-blue-200 transition-colors flex items-center space-x-2"
        >
          <Info className="w-4 h-4" />
          <span>{showDetails ? 'Hide Details' : 'Show Details'}</span>
        </button>
      </div>
    </div>
  );
};

// Helper functions for error information and solutions
function getErrorInformation(code: string, message: string) {
  const errorMap: Record<string, any> = {
    'NETWORK_ERROR': {
      title: 'Network Connection Failed',
      description: 'Unable to connect to the server or external service',
      severity: 'high'
    },
    'VALIDATION_ERROR': {
      title: 'Data Validation Failed',
      description: 'The provided data does not meet the required format or constraints',
      severity: 'medium'
    },
    'SECURITY_ERROR': {
      title: 'Security Validation Failed',
      description: 'The request was blocked due to security concerns',
      severity: 'critical'
    },
    'RATE_LIMIT_ERROR': {
      title: 'Rate Limit Exceeded',
      description: 'Too many requests have been made in a short time period',
      severity: 'medium'
    },
    'EXTERNAL_SERVICE_ERROR': {
      title: 'External Service Error',
      description: 'An external service (e.g., AI API, Geocoding) is unavailable',
      severity: 'high'
    },
    'DATABASE_ERROR': {
      title: 'Database Operation Failed',
      description: 'Unable to complete database operation',
      severity: 'critical'
    },
    'FILE_PROCESSING_ERROR': {
      title: 'File Processing Error',
      description: 'Unable to process the uploaded file',
      severity: 'medium'
    },
    'AI_EXTRACTION_ERROR': {
      title: 'AI Data Extraction Failed',
      description: 'The AI service was unable to extract festival data',
      severity: 'high'
    }
  };

  return errorMap[code] || {
    title: 'Unexpected Error',
    description: message || 'An unexpected error occurred',
    severity: 'medium'
  };
}

function getErrorSolutions(code: string, message: string, details?: any): ErrorSolution[] {
  const baseSolutions: ErrorSolution[] = [
    {
      action: 'Check Connection',
      description: 'Verify your internet connection and try again',
      icon: Wifi,
      priority: 'high'
    },
    {
      action: 'Refresh Page',
      description: 'Reload the page to reset the application state',
      icon: RefreshCw,
      priority: 'high'
    }
  ];

  const specificSolutions: Record<string, ErrorSolution[]> = {
    'NETWORK_ERROR': [
      {
        action: 'Check Internet Connection',
        description: 'Ensure you have a stable internet connection',
        icon: Wifi,
        priority: 'high',
        steps: [
          'Check if other websites load properly',
          'Try refreshing the page',
          'Check your firewall settings',
          'Contact your network administrator if issues persist'
        ]
      },
      {
        action: 'Verify Service Status',
        description: 'Check if external services are operational',
        icon: ExternalLink,
        priority: 'medium',
        steps: [
          'Visit the service status page',
          'Check for scheduled maintenance',
          'Look for service outage notifications',
          'Try again after a few minutes'
        ]
      }
    ],
    'VALIDATION_ERROR': [
      {
        action: 'Review Input Data',
        description: 'Check your data for missing or incorrect information',
        icon: FileText,
        priority: 'high',
        steps: [
          'Verify all required fields are filled',
          'Check date formats (YYYY-MM-DD)',
          'Ensure URLs are valid and accessible',
          'Review file format and size limits'
        ]
      },
      {
        action: 'Use Validation Tools',
        description: 'Use built-in validation to identify specific issues',
        icon: Shield,
        priority: 'medium'
      }
    ],
    'SECURITY_ERROR': [
      {
        action: 'Review URL/File Content',
        description: 'Ensure the URL or file content is safe and appropriate',
        icon: Shield,
        priority: 'critical',
        steps: [
          'Verify the URL is from a trusted source',
          'Check for malicious content in files',
          'Ensure no script injection attempts',
          'Contact support if you believe this is an error'
        ]
      }
    ],
    'RATE_LIMIT_ERROR': [
      {
        action: 'Wait and Retry',
        description: 'Wait for the rate limit to reset before trying again',
        icon: Clock,
        priority: 'high',
        steps: [
          'Wait 60 seconds before retrying',
          'Reduce request frequency',
          'Consider batching operations',
          'Check rate limit documentation'
        ]
      }
    ]
  };

  return specificSolutions[code] || baseSolutions;
}

export default ErrorReporting;