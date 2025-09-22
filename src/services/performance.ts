import { logger } from '@/lib/logger';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface PerformanceTimer {
  start(): void;
  stop(): number;
  getDuration(): number;
}

export class PerformanceService {
  private metrics: PerformanceMetric[] = [];
  private timers: Map<string, number> = new Map();

  constructor() {
    // Initialize performance monitoring
    if (typeof window !== 'undefined') {
      // Browser environment
      this.setupWebVitals();
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: Omit<PerformanceMetric, 'timestamp'>): void {
    const fullMetric: PerformanceMetric = {
      ...metric,
      timestamp: new Date()
    };

    this.metrics.push(fullMetric);

    // Log important metrics
    if (metric.name.includes('duration') && metric.value > 1000) {
      logger.warn('Slow operation detected', {
        metric: metric.name,
        duration: metric.value,
        unit: metric.unit,
        tags: metric.tags
      });
    }

    // Keep only last 1000 metrics to prevent memory leaks
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Create a performance timer
   */
  createTimer(name: string): PerformanceTimer {
    return {
      start: () => {
        this.timers.set(name, Date.now());
      },
      stop: () => {
        const startTime = this.timers.get(name);
        if (startTime === undefined) {
          logger.warn('Timer stopped without being started', { name });
          return 0;
        }
        const duration = Date.now() - startTime;
        this.timers.delete(name);
        this.recordMetric({
          name: `${name}_duration`,
          value: duration,
          unit: 'ms',
          tags: { operation: name }
        });
        return duration;
      },
      getDuration: () => {
        const startTime = this.timers.get(name);
        if (startTime === undefined) {
          return 0;
        }
        return Date.now() - startTime;
      }
    };
  }

  /**
   * Time an async operation
   */
  async timeAsync<T>(
    name: string,
    operation: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const timer = this.createTimer(name);
    timer.start();

    try {
      const result = await operation();
      timer.stop();
      return result;
    } catch (error) {
      timer.stop();
      logger.error('Async operation failed', {
        name,
        duration: timer.getDuration(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Time a synchronous operation
   */
  timeSync<T>(
    name: string,
    operation: () => T,
    tags?: Record<string, string>
  ): T {
    const timer = this.createTimer(name);
    timer.start();

    try {
      const result = operation();
      timer.stop();
      return result;
    } catch (error) {
      timer.stop();
      logger.error('Sync operation failed', {
        name,
        duration: timer.getDuration(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get performance metrics summary
   */
  getMetricsSummary(name?: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  } {
    let relevantMetrics = this.metrics;

    if (name) {
      relevantMetrics = this.metrics.filter(m => m.name === name);
    }

    if (relevantMetrics.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        p95: 0,
        p99: 0
      };
    }

    const values = relevantMetrics.map(m => m.value).sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);

    return {
      count: values.length,
      average: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p95: this.percentile(values, 95),
      p99: this.percentile(values, 99)
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(minutes: number = 60): PerformanceMetric[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil((p / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
  }

  /**
   * Setup web vitals monitoring (browser only)
   */
  private setupWebVitals(): void {
    if (typeof window === 'undefined' || !('performance' in window)) {
      return;
    }

    // Monitor page load performance
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (navigation) {
        this.recordMetric({
          name: 'page_load_time',
          value: navigation.loadEventEnd - navigation.startTime,
          unit: 'ms',
          tags: { type: 'web_vital' }
        });

        this.recordMetric({
          name: 'dom_content_loaded',
          value: navigation.domContentLoadedEventEnd - navigation.startTime,
          unit: 'ms',
          tags: { type: 'web_vital' }
        });

        this.recordMetric({
          name: 'first_paint',
          value: navigation.responseEnd - navigation.fetchStart,
          unit: 'ms',
          tags: { type: 'web_vital' }
        });
      }
    });

    // Monitor long tasks
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) { // Tasks longer than 50ms
              this.recordMetric({
                name: 'long_task',
                value: entry.duration,
                unit: 'ms',
                tags: { type: 'web_vital', name: entry.name }
              });
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        logger.warn('Failed to setup long task observer', { error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }

    // Monitor resource loading
    if ('PerformanceObserver' in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.initiatorType === 'script' || entry.initiatorType === 'link') {
              this.recordMetric({
                name: 'resource_load_time',
                value: entry.duration,
                unit: 'ms',
                tags: {
                  type: 'resource',
                  initiator: entry.initiatorType,
                  name: (entry as PerformanceResourceTiming).name
                }
              });
            }
          }
        });

        resourceObserver.observe({ entryTypes: ['resource'] });
      } catch (e) {
        logger.warn('Failed to setup resource observer', { error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }
  }

  /**
   * Get system health metrics
   */
  getSystemHealth(): {
    memory: NodeJS.MemoryUsage | null;
    uptime: number;
    metrics: any;
  } {
    const health = {
      memory: null as NodeJS.MemoryUsage | null,
      uptime: 0,
      metrics: this.getMetricsSummary()
    };

    if (typeof process !== 'undefined') {
      // Node.js environment
      health.memory = process.memoryUsage();
      health.uptime = process.uptime();
    }

    return health;
  }

  /**
   * Clear old metrics
   */
  clearMetrics(olderThanMinutes: number = 1440): number {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const originalLength = this.metrics.length;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    return originalLength - this.metrics.length;
  }

  /**
   * Export metrics for monitoring systems
   */
  exportMetrics(): string {
    return JSON.stringify({
      metrics: this.metrics,
      summary: this.getMetricsSummary(),
      systemHealth: this.getSystemHealth(),
      exportedAt: new Date().toISOString()
    }, null, 2);
  }
}

// Global performance service instance
export const performanceService = new PerformanceService();