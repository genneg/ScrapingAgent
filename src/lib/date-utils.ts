/**
 * Date utility functions for consistent date formatting and manipulation
 */

export function formatDate(date: Date, format: string = 'PPP'): string {
  try {
    // Simple date formatter - in production you might want to use date-fns or similar
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };

    switch (format) {
      case 'yyyy-MM-dd':
        return date.toISOString().split('T')[0];
      case 'PPP':
        return date.toLocaleDateString('en-US', options);
      case 'PP':
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      default:
        return date.toLocaleDateString('en-US', options);
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime());
}

export function parseDate(dateString: string): Date | null {
  try {
    const date = new Date(dateString);
    return isValidDate(date) ? date : null;
  } catch {
    return null;
  }
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isDateInRange(date: Date, startDate: Date, endDate: Date): boolean {
  return date >= startDate && date <= endDate;
}