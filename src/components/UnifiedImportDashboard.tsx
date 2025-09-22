'use client';

import { useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload, Link, Loader2, CheckCircle, XCircle, Clock, AlertTriangle, Shield } from 'lucide-react';
import { FileSecurityValidator, UrlSecurityValidator } from '@/constants/security';
import { UI_CONSTANTS } from '@/constants/ui';
import { useErrorHandler } from '@/components/ErrorBoundary';

const urlSchema = z.object({
  url: z.string()
    .url('Please enter a valid URL')
    .min(1, 'URL is required')
});

type UrlFormData = z.infer<typeof urlSchema>;

interface ImportProgress {
  status: 'idle' | 'validating' | 'scraping' | 'processing' | 'importing' | 'completed' | 'error';
  message: string;
  progress: number;
  confidence?: number;
  error?: string;
  errorCode?: 'VALIDATION_ERROR' | 'SECURITY_ERROR' | 'NETWORK_ERROR' | 'PROCESSING_ERROR';
}

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  selectedFile: File | null;
  isProcessing: boolean;
  fileError: string | null;
}

function FileUploadComponent({ onFileSelect, onFileRemove, selectedFile, isProcessing, fileError }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const jsonFile = files.find(file => file.type === 'application/json' || file.name.endsWith('.json'));

    if (jsonFile) {
      // Security validation
      const securityValidation = FileSecurityValidator.validateFile(jsonFile);
      if (!securityValidation.valid) {
        onFileSelect(jsonFile); // Still select for UI consistency, but mark as error
        return;
      }

      // Content validation
      const contentValidation = await FileSecurityValidator.validateJsonContent(jsonFile);
      if (!contentValidation.valid) {
        onFileSelect(jsonFile); // Still select for UI consistency, but mark as error
        return;
      }

      onFileSelect(jsonFile);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Security validation
      const securityValidation = FileSecurityValidator.validateFile(file);
      if (!securityValidation.valid) {
        onFileSelect(file); // Still select for UI consistency, but mark as error
        return;
      }

      // Content validation
      const contentValidation = await FileSecurityValidator.validateJsonContent(file);
      if (!contentValidation.valid) {
        onFileSelect(file); // Still select for UI consistency, but mark as error
        return;
      }

      onFileSelect(file);
    }
  }, [onFileSelect]);

  return (
    <div className="relative">
      <input
        type="file"
        accept=".json"
        onChange={handleFileInput}
        className="hidden"
        id="file-upload"
        disabled={isProcessing}
      />

      <label
        htmlFor="file-upload"
        className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : selectedFile
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isProcessing ? (
          <div className="flex flex-col items-center space-y-2">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-gray-600">Processing file...</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center space-y-2">
            {fileError ? (
              <AlertTriangle className="w-8 h-8 text-red-600" />
            ) : (
              <CheckCircle className="w-8 h-8 text-green-600" />
            )}
            <p className={`text-sm font-medium ${fileError ? 'text-red-700' : 'text-gray-700'}`}>
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500">
              {(selectedFile.size / 1024).toFixed(1)} KB • {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            {fileError && (
              <div className="flex items-start space-x-1 p-2 bg-red-50 border border-red-200 rounded-md max-w-xs">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 text-left">{fileError}</p>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onFileRemove();
              }}
              className="mt-2 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              {UI_CONSTANTS.MESSAGES.PLACEHOLDERS.FILE_UPLOAD}
            </p>
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <Shield className="w-3 h-3" />
              <span>Max 10MB • JSON only • Secured processing</span>
            </div>
          </div>
        )}
      </label>
    </div>
  );
});

export default UnifiedImportDashboard;

const UnifiedImportDashboard = memo(function UnifiedImportDashboard() {
  const [activeTab, setActiveTab] = useState<'url' | 'file'>('url');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [urlProgress, setUrlProgress] = useState<ImportProgress>({
    status: 'idle',
    message: '',
    progress: 0
  });
  const [fileProgress, setFileProgress] = useState<ImportProgress>({
    status: 'idle',
    message: '',
    progress: 0
  });

  // Error handling hook
  const { handleError, ErrorFallback } = useErrorHandler();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm<UrlFormData>({
    resolver: zodResolver(urlSchema)
  });

  const handleUrlSubmit = async (data: UrlFormData) => {
    try {
      // Security validation first
      const urlValidation = UrlSecurityValidator.validateUrl(data.url);
      if (!urlValidation.valid) {
        const error = new Error(urlValidation.error || 'URL validation failed');
        handleError(error, 'URL validation');
        setUrlProgress({
          status: 'error',
          message: 'URL validation failed',
          progress: 0,
          error: error.message,
          errorCode: 'SECURITY_ERROR'
        });
        return;
      }

      setUrlProgress({
        status: 'validating',
        message: 'Validating URL...',
        progress: 10
      });

      // Simulate processing stages with proper error handling
      const stages = UI_CONSTANTS.PROGRESS.STAGES.URL_SCRAPING;

      for (const stage of stages) {
        await new Promise(resolve => setTimeout(resolve, UI_CONSTANTS.TIMING.PROGRESS_INTERVAL));
        setUrlProgress(stage);
      }

      reset();
    } catch (error) {
      handleError(error, 'URL processing');
      setUrlProgress({
        status: 'error',
        message: 'Failed to process URL',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorCode: 'PROCESSING_ERROR'
      });
    }
  };

  const handleFileSelect = async (file: File) => {
    try {
      // Security validation
      const securityValidation = FileSecurityValidator.validateFile(file);
      if (!securityValidation.valid) {
        setFileError(securityValidation.error || 'Security validation failed');
        setSelectedFile(file); // Still show the file but mark as error
        return;
      }

      // Content validation
      const contentValidation = await FileSecurityValidator.validateJsonContent(file);
      if (!contentValidation.valid) {
        setFileError(contentValidation.error || 'Content validation failed');
        setSelectedFile(file); // Still show the file but mark as error
        return;
      }

      setFileError(null);
      setSelectedFile(file);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'File validation failed');
      setSelectedFile(file);
    }
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
    setFileError(null);
    setFileProgress({
      status: 'idle',
      message: '',
      progress: 0
    });
  };

  const handleFileSubmit = async () => {
    if (!selectedFile) return;

    // Check if file has validation errors
    if (fileError) {
      setFileProgress({
        status: 'error',
        message: 'Cannot process file with validation errors',
        progress: 0,
        error: fileError,
        errorCode: 'VALIDATION_ERROR'
      });
      return;
    }

    try {
      setFileProgress({
        status: 'processing',
        message: 'Reading JSON file...',
        progress: 20
      });

      // Use constants for processing stages
      const stages = UI_CONSTANTS.PROGRESS.STAGES.FILE_UPLOAD;

      for (const stage of stages) {
        await new Promise(resolve => setTimeout(resolve, UI_CONSTANTS.TIMING.PROGRESS_INTERVAL));
        setFileProgress(stage);
      }
    } catch (error) {
      setFileProgress({
        status: 'error',
        message: 'Failed to process file',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        errorCode: 'PROCESSING_ERROR'
      });
    }
  };

  const getProgressIcon = (status: ImportProgress['status']) => {
    switch (status) {
      case 'validating':
      case 'scraping':
      case 'processing':
      case 'importing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-600" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Import Festival Data
        </h2>
        <p className="text-gray-600">
          Choose to scrape from a website or upload a JSON file
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('url')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === 'url'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <Link className="w-4 h-4" />
            <span>Scrape from URL</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('file')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === 'file'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <Upload className="w-4 h-4" />
            <span>Upload JSON File</span>
          </div>
        </button>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {activeTab === 'url' ? (
          <div className="space-y-6">
            <form onSubmit={handleSubmit(handleUrlSubmit)} className="space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                  Festival Website URL
                </label>
                <input
                  {...register('url')}
                  type="url"
                  placeholder="https://example-festival.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isSubmitting || urlProgress.status !== 'idle'}
                />
                {errors.url && (
                  <p className="mt-1 text-sm text-red-600">{errors.url.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting || urlProgress.status !== 'idle'}
                className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  'Start Scraping'
                )}
              </button>
            </form>

            {/* Progress Display */}
            {urlProgress.status !== 'idle' && (
              <div className="border-t pt-4">
                <div className="flex items-center space-x-3 mb-3">
                  {getProgressIcon(urlProgress.status)}
                  <span className="font-medium text-gray-900">{urlProgress.message}</span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${urlProgress.progress}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm text-gray-600">
                  <span>{urlProgress.progress}% Complete</span>
                  {urlProgress.confidence && (
                    <span>Confidence: {urlProgress.confidence}%</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <FileUploadComponent
              onFileSelect={handleFileSelect}
              onFileRemove={handleFileRemove}
              selectedFile={selectedFile}
              isProcessing={fileProgress.status !== 'idle' && fileProgress.status !== 'completed'}
              fileError={fileError}
            />

            {selectedFile && (
              <button
                onClick={handleFileSubmit}
                disabled={fileProgress.status !== 'idle'}
                className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {fileProgress.status === 'processing' ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing...</span>
                  </div>
                ) : (
                  'Import File'
                )}
              </button>
            )}

            {/* File Progress Display */}
            {fileProgress.status !== 'idle' && (
              <div className="border-t pt-4">
                <div className="flex items-center space-x-3 mb-3">
                  {getProgressIcon(fileProgress.status)}
                  <span className="font-medium text-gray-900">{fileProgress.message}</span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${fileProgress.progress}%` }}
                  />
                </div>

                <div className="text-sm text-gray-600">
                  {fileProgress.progress}% Complete
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default UnifiedImportDashboard;