import { supabase } from '@/integrations/supabase/client';
import { RosterService } from './RosterService';
import { findMatchingRule, extractDateFromText, extractEmployeeInfo, extractDepartment } from './ChatbotRules';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  message: string;
  action?: {
    type: 'viewRoster' | 'createRoster' | 'viewAttendance' | 'generateReport';
    payload?: any;
  };
}

export class AttendanceChatbotService {
  private static async handleUnknownQuery(message: string): Promise<ChatResponse> {
    // Try to extract any recognizable entities
    const date = extractDateFromText(message);
    const employeeInfo = extractEmployeeInfo(message);
    const department = extractDepartment(message);

    let response = "I'm not sure I understand your question. ";

    if (date || employeeInfo.name || employeeInfo.id || department) {
      response += "I noticed you mentioned ";
      const mentions = [];
      if (date) mentions.push(`the date ${date}`);
      if (employeeInfo.name) mentions.push(`employee ${employeeInfo.name}`);
      if (employeeInfo.id) mentions.push(`employee ID ${employeeInfo.id}`);
      if (department) mentions.push(`the ${department} department`);
      
      response += mentions.join(', ') + ". ";
    }

    response += "Try asking more specific questions like:\n" +
      "- Check attendance for [employee name]\n" +
      "- Show late arrivals for today\n" +
      "- Generate attendance report for [department]\n" +
      "- What are the working hours for [employee]?\n\n" +
      "Or type 'help' to see all available commands.";

    return { message: response };
  }

  private static async fetchAttendanceData(query: {
    employeeId?: string;
    employeeName?: string;
    departmentId?: string;
    date?: string;
  }): Promise<any[]> {
    try {
      let queryBuilder = supabase
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
          status,
          employees (
            id,
            name,
            department_id,
            departments (
              id,
              name
            )
          )
        `);

      if (query.date) {
        queryBuilder = queryBuilder.eq('date', query.date);
      }
      if (query.employeeId) {
        queryBuilder = queryBuilder.eq('employee_id', query.employeeId);
      }
      if (query.departmentId) {
        queryBuilder = queryBuilder.eq('employees.department_id', query.departmentId);
      }
      if (query.employeeName) {
        queryBuilder = queryBuilder.ilike('employees.name', `%${query.employeeName}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      return [];
    }
  }

  static async processMessage(message: string): Promise<ChatResponse> {
    try {
      // Find matching rule
      const match = findMatchingRule(message);
      
      if (match) {
        const { rule, matches } = match;
        return {
          message: await rule.handler(matches),
          action: await this.determineAction(message, matches)
        };
      }

      // Handle unknown queries
      return this.handleUnknownQuery(message);
    } catch (error) {
      console.error('Error processing message:', error);
      return {
        message: "I encountered an error processing your request. Please try again or contact support."
      };
    }
  }

  private static async determineAction(message: string, matches: RegExpMatchArray): Promise<ChatResponse['action'] | undefined> {
    const date = extractDateFromText(message);
    const employeeInfo = extractEmployeeInfo(message);
    const department = extractDepartment(message);

    if (message.toLowerCase().includes('roster')) {
      return {
        type: 'viewRoster',
        payload: {
          date,
          employeeId: employeeInfo.id,
          employeeName: employeeInfo.name,
          department
        }
      };
    }

    if (message.toLowerCase().includes('report')) {
      return {
        type: 'generateReport',
        payload: {
          date,
          employeeId: employeeInfo.id,
          employeeName: employeeInfo.name,
          department,
          type: message.toLowerCase().includes('late') ? 'late' :
                message.toLowerCase().includes('absent') ? 'absent' : 'all'
        }
      };
    }

    if (message.toLowerCase().includes('attendance')) {
      return {
        type: 'viewAttendance',
        payload: {
          date,
          employeeId: employeeInfo.id,
          employeeName: employeeInfo.name,
          department
        }
      };
    }

    return undefined;
  }

  static async handleAction(action: ChatResponse['action']): Promise<void> {
    if (!action) return;

    try {
      switch (action.type) {
        case 'viewRoster': {
          const { date, department } = action.payload;
          if (department) {
            await RosterService.getRosters({
              department_id: department,
              startDate: date,
              endDate: date
            });
          }
          break;
        }

        case 'viewAttendance': {
          const { date, employeeId, employeeName, department } = action.payload;
          await this.fetchAttendanceData({
            date,
            employeeId,
            employeeName,
            departmentId: department
          });
          break;
        }

        case 'generateReport': {
          // Handle report generation based on payload type
          const { type, date, department } = action.payload;
          // Implementation would depend on your reporting system
          break;
        }

        default:
          break;
      }
    } catch (error) {
      console.error('Error handling action:', error);
      throw error;
    }
  }
}