// Simple logger for the application
export const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${message}`, meta || '');
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${message}`, meta || '');
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${message}`, meta || '');
  },
  debug: (message: string, meta?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }
};

// Export createLogger function for compatibility
export const createLogger = (serviceName: string) => {
  return {
    info: (message: string, meta?: any) => {
      console.log(`[${serviceName}] [INFO] ${message}`, meta || '');
    },
    warn: (message: string, meta?: any) => {
      console.warn(`[${serviceName}] [WARN] ${message}`, meta || '');
    },
    error: (message: string, meta?: any) => {
      console.error(`[${serviceName}] [ERROR] ${message}`, meta || '');
    },
    debug: (message: string, meta?: any) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${serviceName}] [DEBUG] ${message}`, meta || '');
      }
    }
  };
};