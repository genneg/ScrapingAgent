import React from 'react';
import { Wifi, RefreshCw, AlertTriangle, CheckCircle, Clock, Server, FileText, MapPin, XCircle, ExternalLink, Shield, TrendingUp, Minus, TrendingDown } from 'lucide-react';
import { ValidationResult, ValidationErrorDetail, ValidationWarning } from '@/services/validation';

// Confidence scoring utilities
export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.9) return 'text-green-600';
  if (confidence >= 0.7) return 'text-yellow-600';
  return 'text-red-600';
};

export const getConfidenceBg = (confidence: number): string => {
  if (confidence >= 0.9) return 'bg-green-100';
  if (confidence >= 0.7) return 'bg-yellow-100';
  return 'bg-red-100';
};

export const getConfidenceLevel = (confidence: number): { level: string; color: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> } => {
  if (confidence >= 0.9) return { level: 'Excellent', color: 'green', icon: TrendingUp };
  if (confidence >= 0.7) return { level: 'Good', color: 'yellow', icon: TrendingUp };
  if (confidence >= 0.5) return { level: 'Fair', color: 'orange', icon: Minus };
  return { level: 'Poor', color: 'red', icon: TrendingDown };
};

// Severity utilities
export const getSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'text-red-600';
    case 'high': return 'text-orange-600';
    case 'medium': return 'text-yellow-600';
    case 'low': return 'text-blue-600';
    case 'error': return 'text-orange-600';
    case 'warning': return 'text-yellow-600';
    default: return 'text-gray-600';
  }
};

export const getSeverityBg = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'bg-red-100 border-red-200';
    case 'high': return 'bg-orange-100 border-orange-200';
    case 'medium': return 'bg-yellow-100 border-yellow-200';
    case 'low': return 'bg-blue-100 border-blue-200';
    case 'error': return 'bg-orange-100 border-orange-200';
    case 'warning': return 'bg-yellow-100 border-yellow-200';
    default: return 'bg-gray-100 border-gray-200';
  }
};

// Issue utilities
export const getIssueMessage = (issue: ValidationErrorDetail | ValidationWarning): {
  title: string;
  action: string;
  priority: string;
} => {
  if ('severity' in issue) {
    return {
      title: `${issue.field}: ${issue.message}`,
      action: getActionSuggestion(issue),
      priority: issue.severity
    };
  } else {
    return {
      title: `${issue.field}: ${issue.message}`,
      action: getWarningSuggestion(issue),
      priority: 'warning'
    };
  }
};

const getActionSuggestion = (error: ValidationErrorDetail): string => {
  switch (error.code) {
    case 'SCHEMA_VALIDATION':
      return 'Check data format and required fields';
    case 'DATE_TOO_OLD':
      return 'Verify festival date is current or recent';
    case 'DURATION_TOO_LONG':
      return 'Consider if this is a multi-event festival';
    case 'MISSING_SPECIALTIES':
      return 'Add teacher specialties if available';
    case 'MISSING_GENRE':
      return 'Add musician genres if available';
    case 'INVALID_PRICE_AMOUNT':
      return 'Enter a positive price amount';
    case 'INVALID_DEADLINE':
      return 'Set deadline before festival start';
    default:
      return 'Review and correct the data';
  }
};

const getWarningSuggestion = (warning: ValidationWarning): string => {
  switch (warning.code) {
    case 'MISSING_CITY':
      return 'Add venue city for better location data';
    case 'MISSING_CONTACT_INFO':
      return 'Add website or registration URL';
    case 'LOW_COMPLETENESS':
      return 'Add more festival information';
    case 'SUSPICIOUS_NAME':
      return 'Verify this is not test data';
    default:
      return 'Consider improving this data';
  }
};

// Error handling utilities
export interface ErrorContext {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  operation?: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export const getErrorInformation = (code: string, message: string): {
  title: string;
  description: string;
  severity: string;
} => {
  const errorMap: Record<string, { title: string; description: string; severity: string }> = {
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
};

export interface ErrorSolution {
  action: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  priority: 'high' | 'medium' | 'low';
  steps?: string[];
}

export const getErrorSolutions = (code: string, message: string, details?: unknown): ErrorSolution[] => {
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
        priority: 'high' as const,
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
};

// Date and time utilities
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return 'No date';

  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';

  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return 'No date';

  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';

  return d.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDuration = (start: Date | string | null | undefined, end: Date | string | null | undefined): string => {
  if (!start || !end) return 'Duration unavailable';

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return 'Invalid duration';
  }

  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
};

// Data completeness calculation
export const calculateDataCompleteness = (data: {
  name?: string;
  description?: string;
  website?: string;
  registrationUrl?: string;
  venue?: {
    name?: string;
    address?: string;
    city?: string;
    country?: string;
  };
  teachers?: Array<unknown>;
  musicians?: Array<unknown>;
  prices?: Array<unknown>;
  tags?: Array<unknown>;
}): number => {
  const fields = ['name', 'description', 'website', 'registrationUrl'];
  const venueFields = ['name', 'address', 'city', 'country'];

  let presentFields = 0;
  let totalFields = fields.length;

  // Check main fields
  fields.forEach(field => {
    if (data[field as keyof typeof data]) {
      presentFields++;
    }
  });

  // Check venue fields
  if (data.venue) {
    totalFields += venueFields.length;
    venueFields.forEach(field => {
      if (data.venue![field as keyof typeof data.venue]) {
        presentFields++;
      }
    });
  }

  // Check arrays
  if (data.teachers && data.teachers.length > 0) presentFields++;
  if (data.musicians && data.musicians.length > 0) presentFields++;
  if (data.prices && data.prices.length > 0) presentFields++;
  if (data.tags && data.tags.length > 0) presentFields++;

  totalFields += 4; // For the array checks

  return Math.round((presentFields / totalFields) * 100);
};

// Confidence factors configuration
export const CONFIDENCE_FACTORS = [
  { factor: 'Data Completeness', weight: 0.3 },
  { factor: 'Schema Validation', weight: 0.25 },
  { factor: 'Business Rules', weight: 0.2 },
  { factor: 'Data Quality', weight: 0.15 },
  { factor: 'Source Reliability', weight: 0.1 }
];

// Security utilities
export const isValidExternalUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

export const sanitizeInput = (input: unknown): string => {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, 1000);
};

// Array utilities
export const createStableKey = (item: ValidationErrorDetail | ValidationWarning): string => {
  if ('severity' in item) {
    return `${item.field}-${item.code}-${item.severity}`;
  } else {
    return `${item.field}-${item.code}-warning`;
  }
};

export const sortIssuesBySeverity = (
  issues: Array<ValidationErrorDetail | ValidationWarning>
): Array<ValidationErrorDetail | ValidationWarning> => {
  const severityOrder: Record<string, number> = {
    critical: 0,
    error: 1,
    high: 2,
    medium: 3,
    warning: 4,
    low: 5
  };

  return [...issues].sort((a, b) => {
    const aSeverity = 'severity' in a ? severityOrder[a.severity] || 6 : 4;
    const bSeverity = 'severity' in b ? severityOrder[b.severity] || 6 : 4;
    return aSeverity - bSeverity;
  });
};