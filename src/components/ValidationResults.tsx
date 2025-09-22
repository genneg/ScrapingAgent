'use client';

import React, { useMemo } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, Shield, TrendingUp } from 'lucide-react';
import { ValidationResult, ValidationErrorDetail, ValidationWarning } from '@/services/validation';
import {
  getConfidenceColor,
  getConfidenceBg,
  getSeverityColor,
  getSeverityBg,
  getIssueMessage,
  sortIssuesBySeverity,
  createStableKey,
  calculateDataCompleteness
} from '@/utils/validation-helpers';

interface ValidationResultsProps {
  validation: ValidationResult;
  onFixIssue?: (issue: ValidationErrorDetail | ValidationWarning) => void;
  onAcceptChanges?: () => void;
  showDetails?: boolean;
}

const ValidationResults: React.FC<ValidationResultsProps> = ({
  validation,
  onFixIssue,
  onAcceptChanges,
  showDetails = true
}) => {
  const { isValid, confidence, errors, warnings, normalizedData } = validation;

  const stats = useMemo(() => {
    const criticalErrors = errors.filter(e => e.severity === 'critical').length;
    const regularErrors = errors.filter(e => e.severity === 'error').length;
    const warningCount = warnings.length;

    return {
      criticalErrors,
      regularErrors,
      warningCount,
      totalIssues: criticalErrors + regularErrors + warningCount,
      completeness: Math.round(confidence * 100)
    };
  }, [errors, warnings, confidence]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-orange-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const sortedIssues = useMemo(() => {
    const allIssues = [
      ...errors.map(e => ({ ...e, type: 'error' as const })),
      ...warnings.map(w => ({ ...w, type: 'warning' as const }))
    ];

    return sortIssuesBySeverity(allIssues);
  }, [errors, warnings]);

  if (!showDetails) {
    return (
      <div className={`p-4 rounded-lg border ${
        isValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isValid ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-medium ${
              isValid ? 'text-green-800' : 'text-red-800'
            }`}>
              {isValid ? 'Validation Passed' : 'Validation Failed'}
            </span>
          </div>
          <div className={`text-sm font-medium ${getConfidenceColor(confidence)}`}>
            {Math.round(confidence * 100)}% Confidence
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className={`p-6 rounded-lg border ${
        isValid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {isValid ? (
              <CheckCircle className="w-8 h-8 text-green-600" />
            ) : (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
            <div>
              <h3 className={`text-lg font-semibold ${
                isValid ? 'text-green-800' : 'text-red-800'
              }`}>
                {isValid ? 'Validation Successful' : 'Validation Issues Found'}
              </h3>
              <p className={`text-sm ${
                isValid ? 'text-green-600' : 'text-red-600'
              }`}>
                {isValid
                  ? 'All data meets quality standards'
                  : `${stats.totalIssues} issue${stats.totalIssues !== 1 ? 's' : ''} need attention`
                }
              </p>
            </div>
          </div>

          <div className={`px-4 py-2 rounded-lg ${getConfidenceBg(confidence)}`}>
            <div className="flex items-center space-x-2">
              <TrendingUp className={`w-5 h-5 ${getConfidenceColor(confidence)}`} />
              <div className="text-right">
                <div className={`text-lg font-bold ${getConfidenceColor(confidence)}`}>
                  {stats.completeness}%
                </div>
                <div className={`text-xs ${getConfidenceColor(confidence)}`}>
                  Confidence
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.criticalErrors}</div>
            <div className="text-xs text-gray-600">Critical</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.regularErrors}</div>
            <div className="text-xs text-gray-600">Errors</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.warningCount}</div>
            <div className="text-xs text-gray-600">Warnings</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.completeness}%</div>
            <div className="text-xs text-gray-600">Complete</div>
          </div>
        </div>
      </div>

      {/* Issues List */}
      {sortedIssues.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2" />
            Issues to Resolve ({sortedIssues.length})
          </h4>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {sortedIssues.map((issue) => {
              const issueInfo = getIssueMessage(issue);
              const stableKey = createStableKey(issue);

              return (
                <div
                  key={stableKey}
                  className={`p-3 rounded-lg border-l-4 ${
                    'severity' in issue && issue.severity === 'critical'
                      ? 'border-red-500 bg-red-50'
                      : 'severity' in issue && issue.severity === 'error'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-yellow-500 bg-yellow-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      {getSeverityIcon(
                        'severity' in issue ? issue.severity : 'warning'
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-gray-800 mb-1">
                          {issueInfo.title}
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          {issueInfo.action}
                        </div>
                        {'severity' in issue && (
                          <div className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded inline-block">
                            Code: {issue.code}
                          </div>
                        )}
                      </div>
                    </div>

                    {onFixIssue && (
                      <button
                        onClick={() => onFixIssue(issue)}
                        className="ml-3 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                      >
                        Fix
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Data Quality Indicators */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
          <Shield className="w-5 h-5 mr-2" />
          Data Quality Indicators
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Schema Validation</span>
              <span className={`text-sm font-medium ${
                errors.filter(e => e.code === 'SCHEMA_VALIDATION').length === 0
                  ? 'text-green-600' : 'text-red-600'
              }`}>
                {errors.filter(e => e.code === 'SCHEMA_VALIDATION').length === 0 ? 'Pass' : 'Fail'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  errors.filter(e => e.code === 'SCHEMA_VALIDATION').length === 0
                    ? 'bg-green-500' : 'bg-red-500'
                }`}
                style={{ width: errors.filter(e => e.code === 'SCHEMA_VALIDATION').length === 0 ? '100%' : '0%' }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Business Rules</span>
              <span className={`text-sm font-medium ${
                errors.filter(e => e.code !== 'SCHEMA_VALIDATION').length === 0
                  ? 'text-green-600' : 'text-yellow-600'
              }`}>
                {errors.filter(e => e.code !== 'SCHEMA_VALIDATION').length === 0 ? 'Pass' : 'Warning'}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  errors.filter(e => e.code !== 'SCHEMA_VALIDATION').length === 0
                    ? 'bg-green-500' : 'bg-yellow-500'
                }`}
                style={{ width: Math.max(0, 100 - (errors.filter(e => e.code !== 'SCHEMA_VALIDATION').length * 20)) + '%' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {isValid && onAcceptChanges && (
        <div className="flex justify-end space-x-3">
          <button
            onClick={onAcceptChanges}
            className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <CheckCircle className="w-5 h-5" />
            <span>Accept & Import</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ValidationResults;