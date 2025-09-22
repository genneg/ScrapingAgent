/**
 * UI constants and configuration for the SwingRadar application
 */

export const UI_CONSTANTS = {
  // Timing and animations
  TIMING: {
    PROGRESS_INTERVAL: 1500, // ms between progress updates
    ANIMATION_DURATION: 500, // ms for progress bar animations
    DEBOUNCE_DELAY: 300, // ms for input debouncing
    TOOLTIP_DELAY: 200, // ms before showing tooltips
  },

  // File upload
  FILE_UPLOAD: {
    DRAG_OVER_CLASS: 'border-blue-500 bg-blue-50',
    DRAG_LEAVE_CLASS: 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
    FILE_SELECTED_CLASS: 'border-green-500 bg-green-50',
    ERROR_CLASS: 'border-red-500 bg-red-50',
  },

  // Progress tracking
  PROGRESS: {
    STAGES: {
      URL_SCRAPING: [
        { status: 'validating' as const, message: 'Validating URL...', progress: 10 },
        { status: 'scraping' as const, message: 'Analyzing website structure...', progress: 25 },
        { status: 'scraping' as const, message: 'Extracting content with AI...', progress: 50 },
        { status: 'processing' as const, message: 'Validating extracted data...', progress: 75 },
        { status: 'importing' as const, message: 'Importing to database...', progress: 90 },
        { status: 'completed' as const, message: 'Successfully imported!', progress: 100, confidence: 92 },
      ],
      FILE_UPLOAD: [
        { status: 'processing' as const, message: 'Reading JSON file...', progress: 20 },
        { status: 'processing' as const, message: 'Validating JSON structure...', progress: 40 },
        { status: 'processing' as const, message: 'Checking data completeness...', progress: 60 },
        { status: 'importing' as const, message: 'Importing to database...', progress: 80 },
        { status: 'completed' as const, message: 'File imported successfully!', progress: 100 },
      ],
    },
    CONFIDENCE_THRESHOLD: 85, // minimum confidence score
  },

  // Messages and text
  MESSAGES: {
    VALIDATION: {
      URL_REQUIRED: 'URL is required',
      URL_INVALID: 'Please enter a valid URL',
      FILE_TOO_LARGE: 'File size exceeds limit',
      FILE_TYPE_INVALID: 'Only JSON files are accepted',
      FILE_INVALID: 'Invalid JSON file format',
      SECURITY_ERROR: 'Security validation failed',
    },
    STATUS: {
      IDLE: 'Ready to start',
      VALIDATING: 'Validating...',
      SCRAPING: 'Scraping...',
      PROCESSING: 'Processing...',
      IMPORTING: 'Importing...',
      COMPLETED: 'Completed',
      ERROR: 'Error',
    },
    PLACEHOLDERS: {
      URL_INPUT: 'https://example-festival.com',
      FILE_UPLOAD: 'Drop JSON file here or click to browse',
    },
  },

  // Accessibility
  ARIA: {
    LABELS: {
      FILE_UPLOAD: 'Upload JSON file',
      URL_INPUT: 'Festival website URL',
      TAB_URL: 'URL scraping tab',
      TAB_FILE: 'File upload tab',
      PROGRESS_BAR: 'Operation progress',
    },
    DESCRIPTIONS: {
      FILE_UPLOAD_HELP: 'Upload a JSON file containing festival data. Maximum file size is 10MB.',
      URL_INPUT_HELP: 'Enter the URL of the festival website to scrape data from.',
    },
  },

  // Colors and styling
  COLORS: {
    STATUS: {
      COMPLETED: 'text-green-600 bg-green-100',
      ERROR: 'text-red-600 bg-red-100',
      PROCESSING: 'text-blue-600 bg-blue-100',
      PENDING: 'text-gray-600 bg-gray-100',
    },
    PROGRESS: {
      SUCCESS: 'bg-green-600',
      ERROR: 'bg-red-600',
      ACTIVE: 'bg-blue-600',
      BACKGROUND: 'bg-gray-200',
    },
  },

  // Pagination and display
  DISPLAY: {
    ITEMS_PER_PAGE: 10,
    MAX_VISIBLE_PAGES: 5,
    TRUNCATE_LENGTH: 50,
  },
} as const;