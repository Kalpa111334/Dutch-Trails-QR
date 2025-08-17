import { Attendance, Roster } from '@/types';

export interface LateCalculationResult {
  isLate: boolean;
  lateMinutes: number;
  lateHours: number;
  lateDisplay: string;
}

/**
 * Calculate if an employee is late and by how much based on roster start time
 * @param attendance - The attendance record
 * @param roster - The roster information with start time
 * @returns LateCalculationResult with late information
 */
export function calculateLateness(
  attendance: Attendance,
  roster: Roster
): LateCalculationResult {
  // Default result for no lateness
  const defaultResult: LateCalculationResult = {
    isLate: false,
    lateMinutes: 0,
    lateHours: 0,
    lateDisplay: '0h 0m'
  };

  // Check if we have the required data
  if (!attendance.first_check_in_time || !roster.start_time) {
    return defaultResult;
  }

  try {
    // Parse the check-in time
    const checkInTime = new Date(attendance.first_check_in_time);
    
    // Parse the roster start time for the same date as check-in
    const checkInDate = checkInTime.toISOString().split('T')[0];
    const rosterStartDateTime = new Date(`${checkInDate}T${roster.start_time}`);

    // Calculate the difference in milliseconds
    const timeDifference = checkInTime.getTime() - rosterStartDateTime.getTime();

    // If the difference is positive, the employee is late (no grace period)
    if (timeDifference > 0) {
      const lateMinutes = Math.floor(timeDifference / (1000 * 60));
      const lateHours = Math.floor(lateMinutes / 60);
      const remainingMinutes = lateMinutes % 60;

      return {
        isLate: true,
        lateMinutes,
        lateHours,
        lateDisplay: `${lateHours}h ${remainingMinutes}m`
      };
    }

    return defaultResult;
  } catch (error) {
    console.error('Error calculating lateness:', error);
    return defaultResult;
  }
}

/**
 * Calculate late minutes for database storage
 * @param attendance - The attendance record
 * @param roster - The roster information with start time
 * @returns number of late minutes (0 if not late)
 */
export function calculateLateMinutes(
  attendance: Attendance,
  roster: Roster
): number {
  const result = calculateLateness(attendance, roster);
  return result.lateMinutes;
}

/**
 * Format late minutes into a human-readable string
 * @param lateMinutes - Number of late minutes
 * @returns Formatted string like "1h 30m" or "0h 0m"
 */
export function formatLateTime(lateMinutes: number): string {
  if (lateMinutes <= 0) {
    return '0h 0m';
  }

  const hours = Math.floor(lateMinutes / 60);
  const minutes = lateMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/**
 * Check if an employee should be marked as late based on roster and grace period
 * @param checkInTime - The actual check-in time
 * @param rosterStartTime - The roster start time (HH:mm format)
 * @param gracePeriod - Grace period in minutes
 * @param date - The date for the attendance (optional, defaults to check-in date)
 * @returns boolean indicating if the employee is late
 */
export function isEmployeeLate(
  checkInTime: string,
  rosterStartTime: string,
  gracePeriod: number = 0,
  date?: string
): boolean {
  try {
    const checkIn = new Date(checkInTime);
    const checkInDate = date || checkIn.toISOString().split('T')[0];
    const rosterStart = new Date(`${checkInDate}T${rosterStartTime}`);

    const timeDifference = checkIn.getTime() - rosterStart.getTime();
    const gracePeriodMs = gracePeriod * 60 * 1000;

    return timeDifference > gracePeriodMs;
  } catch (error) {
    console.error('Error checking if employee is late:', error);
    return false;
  }
}

