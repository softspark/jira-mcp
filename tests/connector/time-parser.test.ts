/**
 * Tests for the time parser utility.
 */

import { describe, it, expect } from 'vitest';

import { parseTimeSpent } from '../../src/connector/time-parser';

describe('parseTimeSpent', () => {
  describe('valid inputs', () => {
    it('parses hours only: "2h" -> 7200', () => {
      expect(parseTimeSpent('2h')).toBe(7200);
    });

    it('parses minutes only: "30m" -> 1800', () => {
      expect(parseTimeSpent('30m')).toBe(1800);
    });

    it('parses hours and minutes: "2h 30m" -> 9000', () => {
      expect(parseTimeSpent('2h 30m')).toBe(9000);
    });

    it('parses hours and zero minutes: "1h 0m" -> 3600', () => {
      // Note: "1h 0m" -> hours match 1h = 3600, minutes match 0m = 0
      // total = 3600, which is > 0 so it passes
      expect(parseTimeSpent('1h 0m')).toBe(3600);
    });

    it('parses without space: "2h30m" -> 9000', () => {
      expect(parseTimeSpent('2h30m')).toBe(9000);
    });

    it('handles uppercase: "2H" -> 7200', () => {
      expect(parseTimeSpent('2H')).toBe(7200);
    });

    it('handles uppercase: "30M" -> 1800', () => {
      expect(parseTimeSpent('30M')).toBe(1800);
    });

    it('handles mixed case: "2H 30m" -> 9000', () => {
      expect(parseTimeSpent('2H 30m')).toBe(9000);
    });

    it('handles leading/trailing whitespace', () => {
      expect(parseTimeSpent('  2h  ')).toBe(7200);
    });

    it('parses large values: "100h" -> 360000', () => {
      expect(parseTimeSpent('100h')).toBe(360000);
    });
  });

  describe('invalid inputs', () => {
    it('throws for empty string', () => {
      expect(() => parseTimeSpent('')).toThrow('empty string');
    });

    it('throws for whitespace-only string', () => {
      expect(() => parseTimeSpent('   ')).toThrow('empty string');
    });

    it('throws for days: "2d"', () => {
      expect(() => parseTimeSpent('2d')).toThrow('Days (d) not supported');
    });

    it('throws for days mixed: "1d 2h"', () => {
      expect(() => parseTimeSpent('1d 2h')).toThrow(
        'Days (d) not supported',
      );
    });

    it('throws for unrecognized format: "two hours"', () => {
      expect(() => parseTimeSpent('two hours')).toThrow(
        'Invalid time format',
      );
    });

    it('throws for plain number: "120"', () => {
      expect(() => parseTimeSpent('120')).toThrow('Invalid time format');
    });

    it('throws for "0h 0m" (zero seconds)', () => {
      // "0h 0m" -> 0 hours + 0 minutes = 0 seconds, which triggers the
      // totalSeconds === 0 check
      expect(() => parseTimeSpent('0h 0m')).toThrow('Invalid time format');
    });
  });
});
