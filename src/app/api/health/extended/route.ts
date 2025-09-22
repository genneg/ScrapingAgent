import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { performanceService } from '@/services/performance';
import { SecurityUtils } from '@/lib/security-utils';

export async function GET(request: NextRequest) {
  try {
    const requestId = SecurityUtils.generateRequestId();
    const startTime = Date.now();

    // Health status
    let databaseStatus = 'healthy';
    let databaseResponseTime = 0;
    let databaseError: string | null = null;

    // Check database connectivity
    const dbTimer = performanceService.createTimer('database_health_check');
    dbTimer.start();

    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseResponseTime = dbTimer.stop();
    } catch (error) {
      databaseStatus = 'unhealthy';
      databaseError = error instanceof Error ? error.message : 'Database connection failed';
      dbTimer.stop();
    }

    // Get system health metrics
    const systemHealth = performanceService.getSystemHealth();

    // Get recent performance metrics
    const recentMetrics = performanceService.getRecentMetrics(60); // Last hour
    const performanceSummary = performanceService.getMetricsSummary();

    // Calculate overall health status
    let overallStatus = 'healthy';
    const issues: string[] = [];

    if (databaseStatus !== 'healthy') {
      overallStatus = 'unhealthy';
      issues.push(`Database: ${databaseStatus}`);
    }

    // Check memory usage (if available)
    if (systemHealth.memory) {
      const memoryUsageMB = systemHealth.memory.heapUsed / 1024 / 1024;
      const memoryLimitMB = systemHealth.memory.heapTotal / 1024 / 1024;
      const memoryUsagePercent = (memoryUsageMB / memoryLimitMB) * 100;

      if (memoryUsagePercent > 90) {
        overallStatus = 'unhealthy';
        issues.push(`High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
      } else if (memoryUsagePercent > 75) {
        if (overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
        issues.push(`Elevated memory usage: ${memoryUsagePercent.toFixed(1)}%`);
      }
    }

    // Check response times
    const slowOperations = recentMetrics.filter(m =>
      m.name.includes('duration') && m.value > 1000
    );

    if (slowOperations.length > 5) {
      if (overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
      issues.push(`${slowOperations.length} slow operations detected`);
    }

    // Record this health check
    performanceService.recordMetric({
      name: 'health_check_duration',
      value: Date.now() - startTime,
      unit: 'ms',
      tags: { status: overallStatus }
    });

    // Health response
    const healthData = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: systemHealth.uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      requestId,

      // Database health
      database: {
        status: databaseStatus,
        responseTime: databaseResponseTime,
        error: databaseError
      },

      // System health
      system: {
        memory: systemHealth.memory,
        nodeVersion: process.version,
        platform: process.platform
      },

      // Performance metrics
      performance: {
        summary: performanceSummary,
        recentMetrics: recentMetrics.slice(-20), // Last 20 metrics
        slowOperations: slowOperations.length,
        averageResponseTime: performanceSummary.average
      },

      // Issues found
      issues: issues.length > 0 ? issues : undefined,

      // Additional metadata
      checks: {
        database: databaseStatus === 'healthy',
        memory: systemHealth.memory ?
          (systemHealth.memory.heapUsed / systemHealth.memory.heapTotal) < 0.9 : true,
        responseTime: databaseResponseTime < 5000
      }
    };

    // Set appropriate HTTP status based on health
    let httpStatus = 200;
    if (overallStatus === 'unhealthy') {
      httpStatus = 503;
    } else if (overallStatus === 'degraded') {
      httpStatus = 200;
    }

    return NextResponse.json(healthData, {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
        'X-Health-Status': overallStatus,
        'X-Request-ID': requestId
      }
    });

  } catch (error) {
    const requestId = SecurityUtils.generateRequestId();
    console.error(`[${requestId}] Extended health check failed:`, error);

    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      requestId,
      details: error instanceof Error ? error.message : 'Unknown error'
    }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
        'X-Health-Status': 'unhealthy',
        'X-Request-ID': requestId
      }
    });
  }
}