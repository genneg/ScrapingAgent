import { formatDate, isValidDate, parseDate, addDays, isDateInRange } from './date-utils';

describe('Date Utils', () => {
  const testDate = new Date('2024-06-01T12:00:00.000Z');

  describe('formatDate', () => {
    it('should format date as yyyy-MM-dd', () => {
      const result = formatDate(testDate, 'yyyy-MM-dd');
      expect(result).toBe('2024-06-01');
    });

    it('should format date as PPP (pretty format)', () => {
      const result = formatDate(testDate, 'PPP');
      expect(result).toContain('2024');
      expect(result).toContain('June');
      expect(result).toContain('1');
    });

    it('should handle invalid date gracefully', () => {
      const invalidDate = new Date('invalid');
      const result = formatDate(invalidDate);
      expect(result).toBe('Invalid Date');
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid Date object', () => {
      expect(isValidDate(testDate)).toBe(true);
    });

    it('should return false for invalid Date object', () => {
      const invalidDate = new Date('invalid');
      expect(isValidDate(invalidDate)).toBe(false);
    });

    it('should return false for non-Date object', () => {
      expect(isValidDate('2024-06-01')).toBe(false);
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate(undefined)).toBe(false);
    });
  });

  describe('parseDate', () => {
    it('should parse valid date string', () => {
      const result = parseDate('2024-06-01');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2024);
      expect(result?.getMonth() + 1).toBe(6);
      expect(result?.getDate()).toBe(1);
    });

    it('should return null for invalid date string', () => {
      expect(parseDate('invalid-date')).toBeNull();
    });
  });

  describe('addDays', () => {
    it('should add days to date correctly', () => {
      const result = addDays(testDate, 5);
      expect(result.getDate()).toBe(6); // June 1 + 5 days = June 6
    });

    it('should handle negative days', () => {
      const result = addDays(testDate, -1);
      expect(result.getDate()).toBe(31); // June 1 - 1 day = May 31
    });
  });

  describe('isDateInRange', () => {
    const startDate = new Date('2024-06-01');
    const endDate = new Date('2024-06-10');

    it('should return true for date within range', () => {
      const testDate = new Date('2024-06-05');
      expect(isDateInRange(testDate, startDate, endDate)).toBe(true);
    });

    it('should return true for date equal to start date', () => {
      expect(isDateInRange(startDate, startDate, endDate)).toBe(true);
    });

    it('should return true for date equal to end date', () => {
      expect(isDateInRange(endDate, startDate, endDate)).toBe(true);
    });

    it('should return false for date before range', () => {
      const testDate = new Date('2024-05-30');
      expect(isDateInRange(testDate, startDate, endDate)).toBe(false);
    });

    it('should return false for date after range', () => {
      const testDate = new Date('2024-06-15');
      expect(isDateInRange(testDate, startDate, endDate)).toBe(false);
    });
  });
});