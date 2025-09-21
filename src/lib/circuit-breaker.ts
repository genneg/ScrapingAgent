import { logger } from '@/lib/logger';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening circuit
  resetTimeout: number; // Time in milliseconds to wait before attempting reset
  monitoringPeriod: number; // Time window to monitor failures
  requestTimeout: number; // Timeout for individual requests
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: Date | null;
  nextAttemptTime: Date | null;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: null,
    nextAttemptTime: null,
  };

  private failureTimes: number[] = [];

  constructor(private config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      requestTimeout: 30000, // 30 seconds
      ...config,
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, serviceName: string): Promise<T> {
    // Check if circuit is open
    if (this.isCircuitOpen()) {
      const waitTime = this.state.nextAttemptTime
        ? Math.max(0, this.state.nextAttemptTime.getTime() - Date.now())
        : this.config.resetTimeout;

      logger.warn('Circuit breaker is open, rejecting request', {
        serviceName,
        failureCount: this.state.failureCount,
        waitTime,
        nextAttempt: this.state.nextAttemptTime,
      });

      throw new Error(`Service ${serviceName} temporarily unavailable. Circuit breaker open. Retry after ${Math.ceil(waitTime / 1000)}s.`);
    }

    try {
      // Set timeout for the operation
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timeout after ${this.config.requestTimeout}ms`)), this.config.requestTimeout);
      });

      // Execute the operation with timeout
      const result = await Promise.race([operation(), timeoutPromise]);

      // Success - reset circuit breaker
      this.onSuccess();

      logger.debug('Circuit breaker operation successful', {
        serviceName,
        state: this.getState(),
      });

      return result;
    } catch (error) {
      // Failure - record and potentially open circuit
      this.onFailure();

      logger.warn('Circuit breaker operation failed', {
        serviceName,
        error: error instanceof Error ? error.message : 'Unknown error',
        state: this.getState(),
      });

      throw error;
    }
  }

  /**
   * Check if circuit should be opened
   */
  private isCircuitOpen(): boolean {
    const now = Date.now();

    // If circuit is open, check if it's time to attempt a reset
    if (this.state.isOpen && this.state.nextAttemptTime) {
      if (now >= this.state.nextAttemptTime.getTime()) {
        logger.info('Circuit breaker reset attempt window opened');
        return false; // Allow one attempt to see if service recovered
      }
      return true;
    }

    // Check if we should open the circuit based on recent failures
    const recentFailures = this.getRecentFailures(now);
    return recentFailures >= this.config.failureThreshold;
  }

  /**
   * Get number of recent failures within monitoring period
   */
  private getRecentFailures(now: number): number {
    const cutoff = now - this.config.monitoringPeriod;

    // Clean old failure times
    this.failureTimes = this.failureTimes.filter(time => time > cutoff);

    return this.failureTimes.length;
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.state.isOpen = false;
    this.state.failureCount = 0;
    this.state.lastFailureTime = null;
    this.state.nextAttemptTime = null;

    // Clear some failure times on success (gradual recovery)
    if (this.failureTimes.length > 0) {
      this.failureTimes = this.failureTimes.slice(1);
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    const now = Date.now();

    // Record failure time
    this.failureTimes.push(now);

    this.state.failureCount++;
    this.state.lastFailureTime = new Date(now);

    // Check if we should open the circuit
    const recentFailures = this.getRecentFailures(now);
    if (recentFailures >= this.config.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.state.isOpen = true;
    this.state.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);

    logger.error('Circuit breaker opened', {
      failureCount: this.state.failureCount,
      resetTimeout: this.config.resetTimeout,
      nextAttempt: this.state.nextAttemptTime,
    });
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    const now = Date.now();
    const recentFailures = this.getRecentFailures(now);

    return {
      isOpen: this.state.isOpen,
      failureCount: this.state.failureCount,
      recentFailures,
      failureRate: this.failureTimes.length > 0
        ? (recentFailures / Math.min(this.failureTimes.length, this.config.failureThreshold)) * 100
        : 0,
      lastFailureTime: this.state.lastFailureTime,
      nextAttemptTime: this.state.nextAttemptTime,
      config: this.config,
    };
  }

  /**
   * Force reset the circuit breaker (for testing or manual recovery)
   */
  forceReset(): void {
    this.state = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    };
    this.failureTimes = [];

    logger.info('Circuit breaker manually reset');
  }

  /**
   * Force open the circuit breaker (for testing)
   */
  forceOpen(): void {
    this.openCircuit();
  }
}

// Pre-configured circuit breakers for different services
export const circuitBreakers = {
  claudeApi: new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 30000, // 30 seconds
    monitoringPeriod: 120000, // 2 minutes
    requestTimeout: 45000, // 45 seconds
  }),

  googleMaps: new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    requestTimeout: 10000, // 10 seconds
  }),

  httpRequests: new CircuitBreaker({
    failureThreshold: 10,
    resetTimeout: 15000, // 15 seconds
    monitoringPeriod: 60000, // 1 minute
    requestTimeout: 30000, // 30 seconds
  }),
};

// Helper function to execute with circuit breaker
export async function withCircuitBreaker<T>(
  serviceName: keyof typeof circuitBreakers,
  operation: () => Promise<T>
): Promise<T> {
  const circuitBreaker = circuitBreakers[serviceName];
  return circuitBreaker.execute(operation, serviceName);
}