'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  History,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ExternalLink,
  FileText,
  Globe,
  Calendar,
  TrendingUp
} from 'lucide-react';

interface OperationRecord {
  id: string;
  type: 'url_scraping' | 'file_upload';
  source: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  progress: number;
  confidence?: number;
  error?: string;
  eventsImported?: number;
  venuesImported?: number;
  teachersImported?: number;
}

interface OperationHistoryProps {
  operations?: OperationRecord[];
  onOperationSelect?: (operation: OperationRecord) => void;
}

export default function OperationHistory({ operations = [], onOperationSelect }: OperationHistoryProps) {
  const [filteredOperations, setFilteredOperations] = useState<OperationRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | OperationRecord['status']>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | OperationRecord['type']>('all');

  // Mock data for demonstration
  const mockOperations: OperationRecord[] = [
    {
      id: '1',
      type: 'url_scraping',
      source: 'https://swingcityfestival.com',
      status: 'completed',
      startTime: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      endTime: new Date(Date.now() - 1000 * 60 * 25), // 25 minutes ago
      progress: 100,
      confidence: 94,
      eventsImported: 1,
      venuesImported: 1,
      teachersImported: 8
    },
    {
      id: '2',
      type: 'file_upload',
      source: 'blues-weekend-2024.json',
      status: 'completed',
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 1.8), // 1.8 hours ago
      progress: 100,
      confidence: 98,
      eventsImported: 1,
      venuesImported: 1,
      teachersImported: 12
    },
    {
      id: '3',
      type: 'url_scraping',
      source: 'https://lindyhopfestival.org',
      status: 'error',
      startTime: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
      endTime: new Date(Date.now() - 1000 * 60 * 60 * 3.5), // 3.5 hours ago
      progress: 65,
      error: 'Website structure too complex for AI extraction'
    },
    {
      id: '4',
      type: 'file_upload',
      source: 'swing-parade.json',
      status: 'processing',
      startTime: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
      progress: 78
    }
  ];

  const allOperations = operations.length > 0 ? operations : mockOperations;

  useEffect(() => {
    let filtered = allOperations;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(op => op.status === statusFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(op => op.type === typeFilter);
    }

    // Sort by start time (newest first)
    filtered.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    setFilteredOperations(filtered);
  }, [allOperations, statusFilter, typeFilter]);

  // Memoized Operation Card component to prevent unnecessary re-renders
  const OperationCard = memo(function OperationCard({
    operation,
    onSelect
  }: {
    operation: OperationRecord;
    onSelect?: (operation: OperationRecord) => void;
  }) {
    return (
      <div
        className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => onSelect?.(operation)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4 flex-1">
            {/* Type Icon */}
            <div className="flex-shrink-0">
              {getTypeIcon(operation.type)}
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-3 mb-2">
                <h3 className="text-lg font-medium text-gray-900 truncate">
                  {operation.source}
                </h3>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(operation.status)}`}>
                  {operation.status.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <Calendar className="w-4 h-4" />
                  <span>{formatTime(operation.startTime)}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-4 h-4" />
                  <span>{formatDuration(operation.startTime, operation.endTime)}</span>
                </div>
                {operation.confidence && (
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="w-4 h-4" />
                    <span>{operation.confidence}% confidence</span>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {operation.status === 'processing' && (
                <div className="mt-3">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${operation.progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {operation.progress}% complete
                  </div>
                </div>
              )}

              {/* Error Message */}
              {operation.error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{operation.error}</p>
                </div>
              )}

              {/* Results Summary */}
              {operation.status === 'completed' && (
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  {operation.eventsImported && (
                    <span className="text-green-600">
                      {operation.eventsImported} event{operation.eventsImported !== 1 ? 's' : ''} imported
                    </span>
                  )}
                  {operation.venuesImported && (
                    <span className="text-blue-600">
                      {operation.venuesImported} venue{operation.venuesImported !== 1 ? 's' : ''} imported
                    </span>
                  )}
                  {operation.teachersImported && (
                    <span className="text-purple-600">
                      {operation.teachersImported} teacher{operation.teachersImported !== 1 ? 's' : ''} imported
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status Icon */}
          <div className="flex-shrink-0 ml-4">
            {getStatusIcon(operation.status)}
          </div>
        </div>
      </div>
    );
  });

  const getStatusIcon = useCallback((status: OperationRecord['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  }, []);

  const getStatusColor = useCallback((status: OperationRecord['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }, []);

  const formatDuration = useCallback((startTime: Date, endTime?: Date) => {
    if (!endTime) return 'In progress';

    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    if (durationMinutes < 1) return '< 1 min';
    if (durationMinutes < 60) return `${durationMinutes} min`;

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return `${hours}h ${minutes}m`;
  }, []);

  const formatTime = useCallback((date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const getTypeIcon = useCallback((type: OperationRecord['type']) => {
    switch (type) {
      case 'url_scraping':
        return <Globe className="w-5 h-5 text-blue-600" />;
      case 'file_upload':
        return <FileText className="w-5 h-5 text-green-600" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  }, []);

  const stats = useMemo(() => {
    const total = allOperations.length;
    const completed = allOperations.filter(op => op.status === 'completed').length;
    const errors = allOperations.filter(op => op.status === 'error').length;
    const processing = allOperations.filter(op => op.status === 'processing').length;

    const operationsWithConfidence = allOperations.filter(op => op.confidence);
    const avgConfidence = operationsWithConfidence.length > 0
      ? operationsWithConfidence.reduce((acc, op) => acc + (op.confidence || 0), 0) / operationsWithConfidence.length
      : 0;

    return { total, completed, errors, processing, avgConfidence };
  }, [allOperations]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <History className="w-6 h-6 text-gray-700" />
          <h2 className="text-2xl font-bold text-gray-900">Operation History</h2>
        </div>
        <div className="text-sm text-gray-600">
          {filteredOperations.length} of {allOperations.length} operations
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Processing</p>
              <p className="text-2xl font-bold text-blue-600">{stats.processing}</p>
            </div>
            <Loader2 className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Errors</p>
              <p className="text-2xl font-bold text-red-600">{stats.errors}</p>
            </div>
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Confidence</p>
              <p className="text-2xl font-bold text-purple-600">
                {stats.avgConfidence.toFixed(1)}%
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="error">Error</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-md text-sm"
            >
              <option value="all">All</option>
              <option value="url_scraping">URL Scraping</option>
              <option value="file_upload">File Upload</option>
            </select>
          </div>
        </div>
      </div>

      {/* Operation List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="divide-y divide-gray-200">
          {filteredOperations.length === 0 ? (
            <div className="p-8 text-center">
              <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No operations found</p>
            </div>
          ) : (
            filteredOperations.map((operation) => (
              <OperationCard
                key={operation.id}
                operation={operation}
                onSelect={onOperationSelect}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}