import { supabase } from '@/integrations/supabase/client';
import { Roster, DailyShift, TimeSlot } from '@/integrations/supabase/types';
import { RosterService } from './RosterService';

interface ShiftPreference {
  employeeId: string;
  preferredShifts: ('morning' | 'evening' | 'night')[];
  unavailableDays: string[];
}

interface DepartmentRules {
  minEmployeesPerShift: number;
  maxConsecutiveDays: number;
  requiredSkillSets: string[];
}

export class RosterRecreationService {
  private static async getEmployeePreferences(employeeId: string): Promise<ShiftPreference | null> {
    try {
      // In a real implementation, this would fetch from a preferences table
      // For now, return default preferences
      return {
        employeeId,
        preferredShifts: ['morning'],
        unavailableDays: []
      };
    } catch (error) {
      console.error('Error fetching employee preferences:', error);
      return null;
    }
  }

  private static async getDepartmentRules(departmentId: string): Promise<DepartmentRules> {
    // In a real implementation, this would fetch from a department_rules table
    return {
      minEmployeesPerShift: 2,
      maxConsecutiveDays: 5,
      requiredSkillSets: []
    };
  }

  private static generateTimeSlot(shift: 'morning' | 'evening' | 'night'): TimeSlot {
    switch (shift) {
      case 'morning':
        return { start_time: '09:00', end_time: '17:00' };
      case 'evening':
        return { start_time: '17:00', end_time: '01:00' };
      case 'night':
        return { start_time: '01:00', end_time: '09:00' };
      default:
        return { start_time: '09:00', end_time: '17:00' };
    }
  }

  private static async optimizeShiftPattern(
    startDate: string,
    endDate: string,
    employeeId: string,
    departmentId: string
  ): Promise<DailyShift[]> {
    try {
      const preferences = await this.getEmployeePreferences(employeeId);
      const rules = await this.getDepartmentRules(departmentId);
      
      const pattern: DailyShift[] = [];
      let currentDate = new Date(startDate);
      const end = new Date(endDate);
      let consecutiveDays = 0;

      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Check if employee is unavailable
        if (preferences?.unavailableDays.includes(dateStr)) {
          pattern.push({
            date: dateStr,
            shift: 'off'
          });
          consecutiveDays = 0;
        } else if (consecutiveDays >= rules.maxConsecutiveDays) {
          // Force a day off after max consecutive days
          pattern.push({
            date: dateStr,
            shift: 'off'
          });
          consecutiveDays = 0;
        } else {
          // Assign preferred shift if possible
          const shift = preferences?.preferredShifts[0] || 'morning';
          const timeSlot = this.generateTimeSlot(shift);
          
          pattern.push({
            date: dateStr,
            shift,
            time_slot: timeSlot
          });
          consecutiveDays++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return pattern;
    } catch (error) {
      console.error('Error optimizing shift pattern:', error);
      throw error;
    }
  }

  static async recreateRoster(rosterId: string): Promise<Roster> {
    try {
      // Get existing roster
      const existingRoster = await RosterService.getRosterById(rosterId);
      if (!existingRoster) {
        throw new Error('Roster not found');
      }

      // Optimize shift pattern
      const optimizedPattern = await this.optimizeShiftPattern(
        existingRoster.start_date,
        existingRoster.end_date,
        existingRoster.employee_id,
        existingRoster.department_id
      );

      // Create new roster with optimized pattern
      const newRoster = await RosterService.createRoster({
        ...existingRoster,
        shift_pattern: optimizedPattern,
        name: `${existingRoster.name || 'Roster'} (Optimized)`,
        description: `AI-optimized roster based on ${existingRoster.name || 'original roster'}`,
        is_active: true,
        status: 'active'
      });

      // Deactivate old roster
      await RosterService.updateRoster(rosterId, {
        is_active: false,
        status: 'completed'
      });

      return newRoster;
    } catch (error) {
      console.error('Error recreating roster:', error);
      throw error;
    }
  }

  static async createDepartmentRoster(
    departmentId: string,
    startDate: string,
    endDate: string
  ): Promise<Roster[]> {
    try {
      // Get all active employees in department
      const { data: employees, error } = await supabase
        .from('employees')
        .select('id, position')
        .eq('department_id', departmentId)
        .eq('status', 'active');

      if (error) throw error;
      if (!employees || employees.length === 0) {
        throw new Error('No active employees found in department');
      }

      const rosters: Roster[] = [];

      // Create optimized roster for each employee
      for (const employee of employees) {
        const shiftPattern = await this.optimizeShiftPattern(
          startDate,
          endDate,
          employee.id,
          departmentId
        );

        const roster = await RosterService.createRoster({
          employee_id: employee.id,
          department_id: departmentId,
          position: employee.position || 'General',
          name: `Department Roster - ${new Date().toISOString().split('T')[0]}`,
          description: 'AI-generated department roster',
          start_date: startDate,
          end_date: endDate,
          start_time: '09:00',
          end_time: '17:00',
          break_duration: 60,
          early_departure_threshold: 30,
          shift_pattern: shiftPattern,
          is_active: true,
          status: 'active'
        });

        rosters.push(roster);
      }

      return rosters;
    } catch (error) {
      console.error('Error creating department roster:', error);
      throw error;
    }
  }
}
