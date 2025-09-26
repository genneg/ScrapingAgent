// Simple security utilities
export const SecurityUtils = {
  generateRequestId: () => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  sanitizeUrl: (url: string): string | null => {
    try {
      // Basic URL validation
      const urlObj = new URL(url);

      // Check for potentially dangerous protocols
      const allowedProtocols = ['http:', 'https:'];
      if (!allowedProtocols.includes(urlObj.protocol)) {
        return null;
      }

      // Check for potentially dangerous patterns
      const dangerousPatterns = [
        /javascript:/i,
        /data:/i,
        /vbscript:/i,
        /<script/i,
        /on\w+\s*=/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(url)) {
          return null;
        }
      }

      // Return the cleaned URL
      return urlObj.toString();
    } catch {
      return null;
    }
  }
};