import { supabase } from '@/integrations/supabase/client';
import { Roster } from '@/integrations/supabase/types';

export interface EmployeeRoster {
  id: string;
  employee_id: string;
  roster_id: string;
  effective_from: string;
  effective_until?: string;
  is_primary: boolean;
  roster: Roster;
}

/**
 * Get the active roster for an employee on a specific date
 * @param employeeId - The employee's ID
 * @param date - The date to check (YYYY-MM-DD format)
 * @returns The active roster for the employee on that date
 */
export async function getEmployeeRosterForDate(
  employeeId: string,
  date: string
): Promise<Roster | null> {
  try {
    // Query for active rosters for the employee on the given date
    const { data, error } = await supabase
      .from('rosters')
      .select(`
        id,
        employee_id,
        department_id,
        position,
        name,
        description,
        start_date,
        end_date,
        start_time,
        end_time,
        break_start,
        break_end,
        break_duration,
        shift_pattern,
        notes,
        is_active,
        status,

        early_departure_threshold,
        created_at,
        updated_at,
        created_by,
        updated_by,
        assignment_time,
        completion_time
      `)
      .eq('employee_id', employeeId)
      .eq('is_active', true)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching employee roster:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.warn(`No active roster found for employee ${employeeId} on ${date}`);
      return null;
    }

    return data[0] as Roster;
  } catch (error) {
    console.error('Error in getEmployeeRosterForDate:', error);
    return null;
  }
}

/**
 * Get all rosters for an employee
 * @param employeeId - The employee's ID
 * @returns Array of rosters for the employee
 */
export async function getEmployeeRosters(employeeId: string): Promise<Roster[]> {
  try {
    const { data, error } = await supabase
      .from('rosters')
      .select(`
        id,
        employee_id,
        department_id,
        position,
        name,
        description,
        start_date,
        end_date,
        start_time,
        end_time,
        break_start,
        break_end,
        break_duration,
        shift_pattern,
        notes,
        is_active,
        status,

        early_departure_threshold,
        created_at,
        updated_at,
        created_by,
        updated_by,
        assignment_time,
        completion_time
      `)
      .eq('employee_id', employeeId)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching employee rosters:', error);
      return [];
    }

    return (data || []) as Roster[];
  } catch (error) {
    console.error('Error in getEmployeeRosters:', error);
    return [];
  }
}

/**
 * Get the shift pattern for an employee on a specific date
 * @param roster - The roster object
 * @param date - The date to check (YYYY-MM-DD format)
 * @returns The shift information for that date
 */
export function getShiftForDate(roster: Roster, date: string) {
  if (!roster.shift_pattern || roster.shift_pattern.length === 0) {
    // Return default shift based on roster start/end times
    return {
      date,
      shift: 'regular',
      time_slot: {
        start_time: roster.start_time,
        end_time: roster.end_time
      }
    };
  }

  // Find the shift pattern for the specific date
  const shiftForDate = roster.shift_pattern.find(shift => shift.date === date);
  
  if (shiftForDate) {
    return shiftForDate;
  }

  // If no specific pattern found, return default
  return {
    date,
    shift: 'regular',
    time_slot: {
      start_time: roster.start_time,
      end_time: roster.end_time
    }
  };
}

/**
 * Calculate late minutes based on employee's roster
 * @param employeeId - The employee's ID
 * @param checkInTime - The actual check-in time
 * @param date - The date of attendance
 * @returns Late minutes (0 if on time)
 */
export async function calculateRosterBasedLateness(
  employeeId: string,
  checkInTime: string,
  date: string
): Promise<number> {
  try {
    // Get the employee's roster for the date
    const roster = await getEmployeeRosterForDate(employeeId, date);
    
    if (!roster) {
      console.warn(`No roster found for employee ${employeeId} on ${date}`);
      return 0;
    }

    // Get the shift for the specific date
    const shift = getShiftForDate(roster, date);
    
    if (shift.shift === 'off') {
      // Employee is not scheduled to work
      return 0;
    }

    // Use the shift's start time or roster's default start time
    const rosterStartTime = shift.time_slot?.start_time || roster.start_time;
    
    if (!rosterStartTime) {
      console.warn(`No start time found for employee ${employeeId} on ${date}`);
      return 0;
    }

    // Parse times
    const checkIn = new Date(checkInTime);
    const rosterStart = new Date(`${date}T${rosterStartTime}`);

    // Calculate difference in milliseconds
    const timeDifference = checkIn.getTime() - rosterStart.getTime();

    // If positive, employee is late (no grace period)
    if (timeDifference > 0) {
      return Math.floor(timeDifference / (1000 * 60)); // Convert to minutes
    }

    return 0; // On time or early
  } catch (error) {
    console.error('Error calculating roster-based lateness:', error);
    return 0;
  }
}

/**
 * Format late minutes into display string
 * @param lateMinutes - Number of late minutes
 * @returns Formatted string like "1h 30m" or "On Time"
 */
export function formatLateMinutes(lateMinutes: number): string {
  if (lateMinutes <= 0) {
    return 'On Time';
  }

  const hours = Math.floor(lateMinutes / 60);
  const minutes = lateMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

