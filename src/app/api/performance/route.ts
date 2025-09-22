import { NextRequest, NextResponse } from 'next/server';
import { performanceService } from '@/services/performance';
import { SecurityUtils } from '@/lib/security-utils';

export async function GET(request: NextRequest) {
  try {
    const requestId = SecurityUtils.generateRequestId();
    const { searchParams } = new URL(request.url);

    // Get query parameters
    const minutes = parseInt(searchParams.get('minutes') || '60');
    const name = searchParams.get('name') || undefined;
    const format = searchParams.get('format') || 'json';

    // Validate parameters
    if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: 'Minutes must be between 1 and 1440'
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId
          }
        },
        { status: 400 }
      );
    }

    // Get performance data
    let data;
    if (name) {
      data = {
        summary: performanceService.getMetricsSummary(name),
        recent: performanceService.getRecentMetrics(minutes).filter(m => m.name === name)
      };
    } else {
      data = {
        summary: performanceService.getMetricsSummary(),
        recent: performanceService.getRecentMetrics(minutes),
        systemHealth: performanceService.getSystemHealth(),
        totalMetrics: performanceService.getRecentMetrics(1440).length // Last 24 hours
      };
    }

    // Clean up old metrics
    const clearedCount = performanceService.clearMetrics(1440); // Keep last 24 hours
    if (clearedCount > 0) {
      console.log(`[${requestId}] Cleared ${clearedCount} old performance metrics`);
    }

    // Format response based on requested format
    if (format === 'prometheus') {
      const prometheusData = convertToPrometheusFormat(data);
      return new NextResponse(prometheusData, {
        headers: {
          'Content-Type': 'text/plain; version=0.0.4'
        }
      });
    }

    return NextResponse.json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        metricsCount: data.recent?.length || 0,
        timeRange: `${minutes} minutes`
      }
    });

  } catch (error) {
    const requestId = SecurityUtils.generateRequestId();
    console.error(`[${requestId}] Performance monitoring error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve performance metrics',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId
        }
      },
      { status: 500 }
    );
  }
}

function convertToPrometheusFormat(data: any): string {
  const timestamp = Math.floor(Date.now() / 1000);
  let prometheusText = '';

  // System health metrics
  if (data.systemHealth) {
    if (data.systemHealth.memory) {
      const mem = data.systemHealth.memory;
      prometheusText += `# HELP node_memory_usage_bytes Memory usage in bytes\n`;
      prometheusText += `# TYPE node_memory_usage_bytes gauge\n`;
      prometheusText += `node_memory_usage_bytes{type="rss"} ${mem.rss} ${timestamp}\n`;
      prometheusText += `node_memory_usage_bytes{type="heap_total"} ${mem.heapTotal} ${timestamp}\n`;
      prometheusText += `node_memory_usage_bytes{type="heap_used"} ${mem.heapUsed} ${timestamp}\n`;
      prometheusText += `node_memory_usage_bytes{type="external"} ${mem.external} ${timestamp}\n`;
    }

    if (data.systemHealth.uptime) {
      prometheusText += `# HELP process_uptime_seconds Process uptime in seconds\n`;
      prometheusText += `# TYPE process_uptime_seconds counter\n`;
      prometheusText += `process_uptime_seconds ${data.systemHealth.uptime} ${timestamp}\n`;
    }
  }

  // Performance metrics
  if (data.recent) {
    // Group metrics by name
    const metricGroups = data.recent.reduce((acc: Record<string, Array<{name: string, value: number, tags?: Record<string, string>}>>, metric: {name: string, value: number, tags?: Record<string, string>}) => {
      if (!acc[metric.name]) {
        acc[metric.name] = [];
      }
      acc[metric.name].push(metric);
      return acc;
    }, {});

    // Create metrics for each group
    Object.entries(metricGroups).forEach(([name, metrics]) => {
      const metricsArray = metrics as Array<{name: string, value: number, tags?: Record<string, string>}>;
      const latest = metricsArray[metricsArray.length - 1];
      prometheusText += `# HELP scraping_${name} ${name} metric\n`;
      prometheusText += `# TYPE scraping_${name} gauge\n`;
      prometheusText += `scraping_${name} ${latest.value} ${timestamp}\n`;

      // Add tags as labels if available
      if (latest.tags) {
        Object.entries(latest.tags).forEach(([key, value]) => {
          prometheusText += `scraping_${name}{tag="${key}", value="${value}"} ${latest.value} ${timestamp}\n`;
        });
      }
    });

    // Summary metrics
    if (data.summary) {
      Object.entries(data.summary).forEach(([metricName, summary]: [string, any]) => {
        if (typeof summary === 'object' && summary.count > 0) {
          prometheusText += `# HELP scraping_${metricName}_summary ${metricName} summary statistics\n`;
          prometheusText += `# TYPE scraping_${metricName}_summary gauge\n`;
          prometheusText += `scraping_${metricName}_summary{stat="average"} ${summary.average} ${timestamp}\n`;
          prometheusText += `scraping_${metricName}_summary{stat="min"} ${summary.min} ${timestamp}\n`;
          prometheusText += `scraping_${metricName}_summary{stat="max"} ${summary.max} ${timestamp}\n`;
          prometheusText += `scraping_${metricName}_summary{stat="p95"} ${summary.p95} ${timestamp}\n`;
          prometheusText += `scraping_${metricName}_summary{stat="p99"} ${summary.p99} ${timestamp}\n`;
          prometheusText += `scraping_${metricName}_summary{stat="count"} ${summary.count} ${timestamp}\n`;
        }
      });
    }
  }

  return prometheusText;
}