import { describe, it, expect } from 'vitest';
import { calculateLateness, isEmployeeLate } from './lateCalculation';
import { Attendance, Roster } from '@/types';

describe('Late Calculation Tests', () => {
  describe('calculateLateness', () => {
    it('should return no lateness when check-in is before roster start time', () => {
      const attendance: Attendance = {
        first_check_in_time: '2024-03-20T07:45:00Z',
        id: '1',
        employee_id: '1',
        date: '2024-03-20'
      };
      
      const roster: Roster = {
        id: '1',
        start_time: '08:00',
        end_time: '17:00',
        break_duration: 60,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = calculateLateness(attendance, roster);
      expect(result.isLate).toBe(false);
      expect(result.lateMinutes).toBe(0);
      expect(result.lateDisplay).toBe('0h 0m');
    });

    it('should calculate correct lateness when check-in is after roster start time', () => {
      const attendance: Attendance = {
        first_check_in_time: '2024-03-20T08:30:00Z',
        id: '1',
        employee_id: '1',
        date: '2024-03-20'
      };
      
      const roster: Roster = {
        id: '1',
        start_time: '08:00',
        end_time: '17:00',
        break_duration: 60,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = calculateLateness(attendance, roster);
      expect(result.isLate).toBe(true);
      expect(result.lateMinutes).toBe(30);
      expect(result.lateDisplay).toBe('0h 30m');
    });

    it('should handle hour-level lateness correctly', () => {
      const attendance: Attendance = {
        first_check_in_time: '2024-03-20T10:15:00Z',
        id: '1',
        employee_id: '1',
        date: '2024-03-20'
      };
      
      const roster: Roster = {
        id: '1',
        start_time: '08:00',
        end_time: '17:00',
        break_duration: 60,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = calculateLateness(attendance, roster);
      expect(result.isLate).toBe(true);
      expect(result.lateMinutes).toBe(135);
      expect(result.lateDisplay).toBe('2h 15m');
    });

    it('should handle missing check-in time', () => {
      const attendance: Attendance = {
        first_check_in_time: null,
        id: '1',
        employee_id: '1',
        date: '2024-03-20'
      };
      
      const roster: Roster = {
        id: '1',
        start_time: '08:00',
        end_time: '17:00',
        break_duration: 60,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = calculateLateness(attendance, roster);
      expect(result.isLate).toBe(false);
      expect(result.lateMinutes).toBe(0);
      expect(result.lateDisplay).toBe('0h 0m');
    });
  });

  describe('isEmployeeLate', () => {
    it('should return false when check-in is before roster start time', () => {
      const result = isEmployeeLate(
        '2024-03-20T07:45:00Z',
        '08:00',
        0
      );
      expect(result).toBe(false);
    });

    it('should return true when check-in is after roster start time', () => {
      const result = isEmployeeLate(
        '2024-03-20T08:15:00Z',
        '08:00',
        0
      );
      expect(result).toBe(true);
    });

    it('should handle grace period correctly', () => {
      // Not late within grace period
      expect(isEmployeeLate(
        '2024-03-20T08:05:00Z',
        '08:00',
        10
      )).toBe(false);

      // Late beyond grace period
      expect(isEmployeeLate(
        '2024-03-20T08:11:00Z',
        '08:00',
        10
      )).toBe(true);
    });

    it('should handle different roster start times', () => {
      // Early shift
      expect(isEmployeeLate(
        '2024-03-20T06:31:00Z',
        '06:30',
        0
      )).toBe(true);

      // Late shift
      expect(isEmployeeLate(
        '2024-03-20T14:00:00Z',
        '14:00',
        0
      )).toBe(false);
    });
  });
});
