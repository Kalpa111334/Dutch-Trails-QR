import { supabase } from '@/integrations/supabase/client';
import { RosterService } from './RosterService';

interface AttendanceOptimizationResult {
  totalRecords: number;
  optimizedRecords: number;
  errors: string[];
}

interface WorkingTimeCalculation {
  totalMinutes: number;
  breakMinutes: number;
  netWorkingMinutes: number;
}

export class AttendanceDataRecreationService {
  private static async calculateWorkingTime(
    firstCheckIn: string | null,
    firstCheckOut: string | null,
    secondCheckIn: string | null,
    secondCheckOut: string | null
  ): Promise<WorkingTimeCalculation> {
    let totalMinutes = 0;
    let breakMinutes = 0;

    if (firstCheckIn && firstCheckOut) {
      const checkIn = new Date(firstCheckIn);
      const checkOut = new Date(firstCheckOut);
      totalMinutes += Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 60));
    }

    if (secondCheckIn && secondCheckOut) {
      const checkIn = new Date(secondCheckIn);
      const checkOut = new Date(secondCheckOut);
      totalMinutes += Math.max(0, (checkOut.getTime() - checkIn.getTime()) / (1000 * 60));
    }

    if (firstCheckOut && secondCheckIn) {
      const breakStart = new Date(firstCheckOut);
      const breakEnd = new Date(secondCheckIn);
      breakMinutes = Math.max(0, (breakEnd.getTime() - breakStart.getTime()) / (1000 * 60));
    }

    return {
      totalMinutes,
      breakMinutes,
      netWorkingMinutes: totalMinutes - breakMinutes
    };
  }

  private static async calculateLateDuration(
    checkInTime: string,
    rosterId: string
  ): Promise<number> {
    try {
      const roster = await RosterService.getRosterById(rosterId);
      if (!roster) return 0;

      const checkIn = new Date(checkInTime);
      const [hours, minutes] = roster.start_time.split(':').map(Number);
      const rosterStart = new Date(checkIn);
      rosterStart.setHours(hours, minutes, 0, 0);

      const lateMinutes = Math.max(0, (checkIn.getTime() - rosterStart.getTime()) / (1000 * 60));
      return lateMinutes;
    } catch (error) {
      console.error('Error calculating late duration:', error);
      return 0;
    }
  }

  static async recreateAttendanceData(
    startDate: string,
    endDate: string,
    departmentId?: string
  ): Promise<AttendanceOptimizationResult> {
    const result: AttendanceOptimizationResult = {
      totalRecords: 0,
      optimizedRecords: 0,
      errors: []
    };

    try {
      // Fetch attendance records
      let query = supabase
        .from('attendance')
        .select(`
          id,
          employee_id,
          date,
          first_check_in_time,
          first_check_out_time,
          second_check_in_time,
          second_check_out_time,
          break_duration_minutes,
          working_duration_minutes,
          minutes_late,
          roster_id,
          employees (
            department_id
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate);

      if (departmentId) {
        query = query.eq('employees.department_id', departmentId);
      }

      const { data: records, error } = await query;

      if (error) throw error;
      if (!records) return result;

      result.totalRecords = records.length;

      // Process each record
      for (const record of records) {
        try {
          // Calculate working time
          const workingTime = await this.calculateWorkingTime(
            record.first_check_in_time,
            record.first_check_out_time,
            record.second_check_in_time,
            record.second_check_out_time
          );

          // Calculate late duration if roster is available
          let lateDuration = 0;
          if (record.roster_id && record.first_check_in_time) {
            lateDuration = await this.calculateLateDuration(
              record.first_check_in_time,
              record.roster_id
            );
          }

          // Update record with optimized values
          const { error: updateError } = await supabase
            .from('attendance')
            .update({
              working_duration_minutes: workingTime.netWorkingMinutes,
              break_duration_minutes: workingTime.breakMinutes,
              minutes_late: lateDuration,
              updated_at: new Date().toISOString()
            })
            .eq('id', record.id);

          if (updateError) {
            result.errors.push(`Failed to update record ${record.id}: ${updateError.message}`);
            continue;
          }

          result.optimizedRecords++;
        } catch (error) {
          result.errors.push(`Error processing record ${record.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error in recreateAttendanceData:', error);
      throw error;
    }
  }

  static async optimizeAttendanceReports(
    startDate: string,
    endDate: string,
    departmentId?: string
  ): Promise<void> {
    try {
      // Get all attendance records for the period
      let query = supabase
        .from('attendance')
        .select(`
          id,
          employee_id,
          date,
          first_check_in_time,
          first_check_out_time,
          second_check_in_time,
          second_check_out_time,
          break_duration_minutes,
          working_duration_minutes,
          minutes_late,
          roster_id,
          employees (
            department_id,
            name,
            position
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate);

      if (departmentId) {
        query = query.eq('employees.department_id', departmentId);
      }

      const { data: records, error } = await query;

      if (error) throw error;
      if (!records || records.length === 0) return;

      // Group records by employee
      const employeeRecords = records.reduce((acc, record) => {
        const employeeId = record.employee_id;
        if (!acc[employeeId]) {
          acc[employeeId] = [];
        }
        acc[employeeId].push(record);
        return acc;
      }, {} as Record<string, typeof records>);

      // Process each employee's records
      for (const [employeeId, records] of Object.entries(employeeRecords)) {
        // Calculate employee statistics
        const totalDays = records.length;
        const onTimeDays = records.filter(r => !r.minutes_late || r.minutes_late === 0).length;
        const lateDays = totalDays - onTimeDays;
        const totalWorkingMinutes = records.reduce((sum, r) => sum + (r.working_duration_minutes || 0), 0);
        const averageWorkingMinutes = totalWorkingMinutes / totalDays;
        const complianceRate = (onTimeDays / totalDays) * 100;

        // Update each record with the calculated statistics
        for (const record of records) {
          const { error: updateError } = await supabase
            .from('attendance')
            .update({
              attendance_stats: {
                total_days: totalDays,
                on_time_days: onTimeDays,
                late_days: lateDays,
                average_working_minutes: averageWorkingMinutes,
                compliance_rate: complianceRate
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', record.id);

          if (updateError) {
            console.error(`Failed to update record ${record.id}:`, updateError);
          }
        }
      }
    } catch (error) {
      console.error('Error in optimizeAttendanceReports:', error);
      throw error;
    }
  }

  static async generateAttendanceInsights(
    startDate: string,
    endDate: string,
    departmentId?: string
  ): Promise<{
    departmentStats: Record<string, {
      totalEmployees: number;
      averageAttendance: number;
      averageLateMinutes: number;
      complianceRate: number;
    }>;
    trends: {
      date: string;
      onTimeCount: number;
      lateCount: number;
      averageWorkingHours: number;
    }[];
  }> {
    try {
      // Fetch attendance records with employee and department info
      let query = supabase
        .from('attendance')
        .select(`
          id,
          date,
          minutes_late,
          working_duration_minutes,
          employees (
            id,
            name,
            department_id,
            departments (
              id,
              name
            )
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate);

      if (departmentId) {
        query = query.eq('employees.department_id', departmentId);
      }

      const { data: records, error } = await query;

      if (error) throw error;
      if (!records || records.length === 0) {
        return {
          departmentStats: {},
          trends: []
        };
      }

      // Group records by department
      const departmentRecords = records.reduce((acc, record) => {
        const deptId = record.employees?.department_id || 'unassigned';
        if (!acc[deptId]) {
          acc[deptId] = [];
        }
        acc[deptId].push(record);
        return acc;
      }, {} as Record<string, typeof records>);

      // Calculate department statistics
      const departmentStats = Object.entries(departmentRecords).reduce((acc, [deptId, records]) => {
        const totalEmployees = new Set(records.map(r => r.employees?.id)).size;
        const totalRecords = records.length;
        const onTimeRecords = records.filter(r => !r.minutes_late || r.minutes_late === 0).length;
        const totalLateMinutes = records.reduce((sum, r) => sum + (r.minutes_late || 0), 0);
        const totalWorkingMinutes = records.reduce((sum, r) => sum + (r.working_duration_minutes || 0), 0);

        acc[deptId] = {
          totalEmployees,
          averageAttendance: (totalRecords / totalEmployees) * 100,
          averageLateMinutes: totalLateMinutes / totalRecords,
          complianceRate: (onTimeRecords / totalRecords) * 100
        };

        return acc;
      }, {} as Record<string, {
        totalEmployees: number;
        averageAttendance: number;
        averageLateMinutes: number;
        complianceRate: number;
      }>);

      // Calculate daily trends
      const dateRecords = records.reduce((acc, record) => {
        const date = record.date;
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(record);
        return acc;
      }, {} as Record<string, typeof records>);

      const trends = Object.entries(dateRecords).map(([date, records]) => ({
        date,
        onTimeCount: records.filter(r => !r.minutes_late || r.minutes_late === 0).length,
        lateCount: records.filter(r => r.minutes_late && r.minutes_late > 0).length,
        averageWorkingHours: records.reduce((sum, r) => sum + ((r.working_duration_minutes || 0) / 60), 0) / records.length
      }));

      return {
        departmentStats,
        trends: trends.sort((a, b) => a.date.localeCompare(b.date))
      };
    } catch (error) {
      console.error('Error in generateAttendanceInsights:', error);
      throw error;
    }
  }
}
