import React, { useState, useEffect, useRef } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Download, 
  Calendar as CalendarIcon, 
  Users, 
  Clock, 
  Search,
  FileText,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  Share,
  Image,
  Printer
} from 'lucide-react';
import { format, startOfDay, endOfDay, parseISO, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calculateLateDuration, formatLateDuration, getRosterBasedLateDuration } from '@/utils/lateDurationUtils';
import { getShiftForDate } from '@/utils/rosterUtils';
import { getEffectiveStatus } from '@/utils/attendanceUtils';
import { RosterStartEditor } from './RosterStartEditor';

interface PresentEmployee {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  first_check_in: string | null;
  first_check_out: string | null;
  second_check_in: string | null;
  second_check_out: string | null;
  late_minutes: number;
  break_hours: number;
  working_duration: number; // in minutes
  department: string;
  position: string;
  status: string;
}

interface Department {
  id: string;
  name: string;
}

interface PresentEmployeeReportProps {
  className?: string;
  onSuccess?: () => void;
}

interface RosterInfo {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_duration: number;

  early_departure_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Optional shift pattern for date-specific working hours
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shift_pattern?: any[];
}

interface AttendanceRecord {
  id: string;
  date: string;
  first_check_in_time: string | null;
  first_check_out_time: string | null;
  second_check_in_time: string | null;
  second_check_out_time: string | null;
  break_duration_minutes: number | null;
  working_duration_minutes: number | null;
  status: string;
  minutes_late: number;
  departmentGroup?: string;
  employee: {
    id: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    department_id: string;
    position: string;
    department: {
      id: string;
      name: string;
    };
  };
  roster: RosterInfo | null;
}

export function PresentEmployeeReport({ className, onSuccess }: PresentEmployeeReportProps) {
  const [presentEmployees, setPresentEmployees] = useState<PresentEmployee[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<PresentEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [departments, setDepartments] = useState<Department[]>([]);
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reportData, setReportData] = useState<AttendanceRecord[]>([]);
  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const [pdfWidthMode, setPdfWidthMode] = useState<'compact' | 'fit' | 'wide' | 'xwide'>('fit');
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('landscape');

  // Function to validate department selection
  const validateDepartment = (departmentId: string): Department | { id: 'all', name: 'All Departments' } | null => {
    if (departmentId === 'all') {
      return { id: 'all', name: 'All Departments' };
    }
    const dept = departments.find(d => d.id === departmentId);
    if (!dept) {
      console.error('Invalid department selected:', departmentId);
      console.log('Available departments:', departments);
      toast({
        title: 'Error',
        description: 'Invalid department selected',
        variant: 'destructive',
      });
      return null;
    }
    return dept;
  };

  // Function to handle department selection
  const handleDepartmentChange = (value: string) => {
    console.log('Department selected:', value);
    console.log('Available departments:', departments);
    const dept = validateDepartment(value);
    if (dept) {
      console.log('Selected department data:', dept);
      setSelectedDepartment(value);
      // Clear any existing report data when department changes
      setReportData([]);
    }
  };

  // Function to ensure department exists
  const ensureDepartmentExists = async (departmentName: string): Promise<Department | null> => {
    try {
      // First try to find the department
      const { data: existingDept, error: findError } = await supabase
        .from('departments')
        .select('id, name')
        .eq('name', departmentName)
        .single();

      if (existingDept) {
        console.log('Found existing department:', existingDept);
        return existingDept;
      }

      // If not found, create it
      console.log('Department not found, creating:', departmentName);
      const { data: newDept, error: createError } = await supabase
        .from('departments')
        .insert({ name: departmentName })
        .select()
        .single();

      if (createError) {
        console.error('Error creating department:', createError);
        toast({
          title: 'Error',
          description: `Failed to create department "${departmentName}"`,
          variant: 'destructive',
        });
        return null;
      }

      console.log('Created new department:', newDept);
      return newDept;
    } catch (error) {
      console.error('Error in ensureDepartmentExists:', error);
      return null;
    }
  };

  // Fetch departments on component mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        // First ensure Dutch Activity department exists
        const dutchActivityDept = await ensureDepartmentExists('Dutch Activity');
        
        // Then fetch all departments
        const { data, error } = await supabase
          .from('departments')
          .select('id, name')
          .order('name');

        if (error) throw error;

        if (data) {
          // Log departments for debugging
          console.log('Fetched departments:', data.map(d => ({ id: d.id, name: d.name })));
          
          // Filter out any null or undefined values
          const validDepartments = data.filter(d => d && d.id && d.name);
          
          if (validDepartments.length === 0) {
            console.warn('No valid departments found');
            toast({
              title: 'Warning',
              description: 'No departments found',
              variant: 'default',
            });
          }
          
          setDepartments(validDepartments);
        }
      } catch (error) {
        console.error('Error fetching departments:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch departments',
          variant: 'destructive',
        });
      }
    };

    fetchDepartments();
  }, []);

  // Fetch present employees data
  const fetchPresentEmployees = async (date: Date) => {
    try {
      setLoading(true);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Query attendance records for the selected date
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          id,
          employee_id,
          date,
          first_check_in_time,
          first_check_out_time,
          second_check_in_time,
          second_check_out_time,
          status,
          working_duration_minutes,
          minutes_late,
          break_duration_minutes,
          employees:employee_id (
            name,
            first_name,
            last_name,
            department_id,
            position,
            departments:department_id (
              name
            )
          )
        `)
        .eq('date', dateStr)
        .in('status', ['PRESENT', 'CHECKED_IN', 'CHECKED_OUT', 'FIRST_SESSION_ACTIVE', 'FIRST_CHECK_OUT', 'SECOND_SESSION_ACTIVE', 'SECOND_CHECK_OUT', 'COMPLETED']);

      if (attendanceError) {
        console.error('Error fetching attendance:', attendanceError);
        throw attendanceError;
      }

      // Process the data to calculate required metrics
      const processedData: PresentEmployee[] = (attendanceData || []).map((record: any) => {
        const employee = record.employees;
        const employeeName = employee ? 
          (employee.first_name && employee.last_name 
            ? `${employee.first_name} ${employee.last_name}` 
            : employee.name || 'Unknown') 
          : 'Unknown';

        // Calculate late minutes using roster-based calculation
        let lateMinutes = record.minutes_late || 0;
        const firstCheckIn = record.first_check_in_time;
        
        // Use stored late minutes value - roster-based calculation should happen during attendance recording
        // The actual roster-based calculation is handled by the attendance recording system
        if (record.minutes_late && record.minutes_late > 0) {
          lateMinutes = record.minutes_late;
        } else {
          lateMinutes = 0;
        }

        // Calculate break hours - use stored value or calculate
        let breakMinutes = record.break_duration_minutes || 0;
        if (!breakMinutes && record.first_check_out_time && record.second_check_in_time) {
          const firstCheckOut = parseISO(record.first_check_out_time);
          const secondCheckIn = parseISO(record.second_check_in_time);
          breakMinutes = differenceInMinutes(secondCheckIn, firstCheckOut);
        }

        // Calculate working duration - use stored value or calculate
        let workingMinutes = record.working_duration_minutes || 0;
        if (!workingMinutes && firstCheckIn) {
          // Calculate manually if not stored
          const checkInTime = parseISO(firstCheckIn);
          let totalWorked = 0;

          // First session
          if (record.first_check_out_time) {
            const firstCheckOut = parseISO(record.first_check_out_time);
            totalWorked += differenceInMinutes(firstCheckOut, checkInTime);
          } else {
            // Still working
            totalWorked += differenceInMinutes(new Date(), checkInTime);
          }

          // Second session
          if (record.second_check_in_time) {
            const secondCheckIn = parseISO(record.second_check_in_time);
            if (record.second_check_out_time) {
              const secondCheckOut = parseISO(record.second_check_out_time);
              totalWorked += differenceInMinutes(secondCheckOut, secondCheckIn);
            } else {
              // Still in second session
              totalWorked += differenceInMinutes(new Date(), secondCheckIn);
            }
          }

          workingMinutes = totalWorked;
        }

        return {
          id: record.id,
          employee_id: record.employee_id,
          employee_name: employeeName,
          date: record.date,
          first_check_in: record.first_check_in_time,
          first_check_out: record.first_check_out_time,
          second_check_in: record.second_check_in_time,
          second_check_out: record.second_check_out_time,
          late_minutes: Math.max(0, lateMinutes),
          break_hours: breakMinutes / 60,
          working_duration: workingMinutes,
          department: employee?.departments?.name || 'Unassigned',
          position: employee?.position || 'Unassigned',
          status: record.status
        };
      });

      setPresentEmployees(processedData);

      toast({
        title: 'Success',
        description: `Found ${processedData.length} present employees for ${format(date, 'PP')}`,
      });

    } catch (error) {
      console.error('Error fetching present employees:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch present employees data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter employees based on search and department
  useEffect(() => {
    let filtered = presentEmployees;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = filtered.filter(emp =>
        emp.employee_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.position.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by department
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(emp => emp.department === departmentFilter);
    }

    setFilteredEmployees(filtered);
  }, [presentEmployees, searchQuery, departmentFilter]);

  // Load data when component mounts or date changes
  useEffect(() => {
    fetchPresentEmployees(selectedDate);
  }, [selectedDate]);

  // Format time display
  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-';
    try {
      return format(parseISO(timeString), 'HH:mm');
    } catch {
      return '-';
    }
  };

  // Format duration display
  const formatDuration = (minutes: number | null) => {
    if (!minutes || minutes === 0) return '-';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    // For durations less than an hour, only show minutes
    if (hours === 0) {
      return `${mins}M`;
    }
    
    // For durations with hours, pad minutes with leading zero if needed
    return `${hours}H ${mins.toString().padStart(2, '0')}M`;
  };

  // Employee/Department-specific roster start overrides and helpers
  const canonicalize = (value: string): string =>
    value?.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();

  const getEmployeeDisplayName = (record: AttendanceRecord): string => {
    const first = record.employee?.first_name || '';
    const last = record.employee?.last_name || '';
    const full = `${first} ${last}`.trim();
    return full || record.employee?.name || '';
  };

  const getOverrideStart = (record: AttendanceRecord): string | null => {
    // Per-employee overrides
    const name = canonicalize(getEmployeeDisplayName(record));
    const personOverrides: Record<string, string> = {
      'thilini fernando': '08:30',
      'sayuri perera': '09:30',
      'harshani nisansala': '15:00',
      'subashini meemanage': '15:00',
      'jasintha croose': '07:00',
      'lathishiya rodrigo': '07:00',
      'sumith perera sumith': '07:00',
      'shanmugam prabhkaran': '15:00',
      // New IT overrides per request
      'kalpa wishvajith': '09:00',
      'kasun vishvanath': '09:00',
      'sahan chathuranga': '09:00',
      'janitha kasun': '09:00',
      'sheran fernando': '09:00',
      'rohan sudarshana': '09:00',
      'rohan sudarhsana': '09:00',
      'kithsiri perera': '12:00',
      'dinithi chamathka': '08:30',
      'hashini munithunga': '08:30',
      'sandali kavinga': '08:30',
    };
    if (personOverrides[name]) return personOverrides[name];

    // Department-level overrides (example retained)
    const deptName = record.employee?.department?.name || '';
    if (deptName === 'Administration') return '08:30';
    return null;
  };

  const getEffectiveRosterStart = (record: AttendanceRecord): string => {
    if (!record.roster) return '-';
    
    try {
      // Get the shift pattern for the specific date if available
      if (record.roster.shift_pattern && Array.isArray(record.roster.shift_pattern)) {
        const date = new Date(record.date);
        const dayOfWeek = date.getDay();
        const shift = record.roster.shift_pattern.find(s => s.day === dayOfWeek);
        if (shift?.time_slot?.start_time) {
          return shift.time_slot.start_time;
        }
      }
      
      // Fall back to the default roster start time
      return record.roster.start_time || '-';
    } catch (error) {
      console.error('Error getting roster start time:', error);
      return record.roster.start_time || '-';
    }
  };

  const withDepartmentOverride = (roster: RosterInfo | null, record: AttendanceRecord): RosterInfo | null => {
    if (!roster) return null;
    const override = getOverrideStart(record);
    if (!override) return roster;
    const endTime = (roster as any)?.end_time || '17:30';
    return {
      ...roster,
      start_time: override,
      // ensure calc reads override from shift_pattern first
      shift_pattern: [{ time_slot: { start_time: override, end_time: endTime } }] as any,
    } as RosterInfo;
  };

  const fetchAttendanceData = async () => {
    if (!startDate || !endDate) {
      toast({
        title: 'Validation Error',
        description: 'Please select date range',
        variant: 'destructive',
      });
      return null;
    }

    try {
      // Log query parameters for debugging
      console.log('Fetching attendance with params:', {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        departmentId: selectedDepartment,
        availableDepartments: departments
      });

      // First get all active employees with their department info
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, name, first_name, last_name, department_id, position')
        .eq('status', 'active');

      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        throw new Error(`Failed to fetch employees: ${employeesError.message}`);
      }

      // Get departments info separately
      const { data: departmentsData, error: departmentsError } = await supabase
        .from('departments')
        .select('id, name');

      if (departmentsError) {
        console.error('Error fetching departments:', departmentsError);
        throw new Error(`Failed to fetch departments: ${departmentsError.message}`);
      }

      // Create a map of department IDs to department names
      const departmentMap = departmentsData.reduce((map, dept) => {
        map[dept.id] = dept.name;
        return map;
      }, {} as Record<string, string>);

      // Add department names to employees data
      const employeesWithDept = employeesData.map(emp => ({
        ...emp,
        department: {
          id: emp.department_id,
          name: departmentMap[emp.department_id] || 'Unassigned'
        }
      }));

      // Filter employees based on department selection
      const validEmployees = selectedDepartment === 'all'
        ? employeesWithDept
        : employeesWithDept?.filter(emp => emp.department_id === selectedDepartment) || [];

      if (!validEmployees || validEmployees.length === 0) {
        console.log('No active employees found', selectedDepartment === 'all' ? 'across all departments' : `in department: ${selectedDepartment}`);
        toast({
          title: 'No Employees',
          description: 'No active employees found in the selected department(s)',
          variant: 'default',
        });
        return [];
      }

      const employeeIds = validEmployees.map(emp => emp.id);
      console.log(`Found ${employeeIds.length} active employees ${selectedDepartment === 'all' ? 'across all departments' : 'in department'}`);

      // Fetch attendance records for these employees
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          id,
          date,
          first_check_in_time,
          first_check_out_time,
          second_check_in_time,
          second_check_out_time,
          break_duration_minutes,
          working_duration_minutes,
          status,
          minutes_late,
          employee_id,
          roster:roster_id (
            id,
            name,
            start_time,
            end_time,
            break_duration,
            shift_pattern,
            early_departure_threshold,
            is_active,
            created_at,
            updated_at,
            start_date,
            end_date,
            department_id,
            employee_id
          )
        `)
        .in('employee_id', employeeIds)
        .gte('date', format(startDate, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))
        .order('date', { ascending: true });

      if (attendanceError) {
        console.error('Attendance fetch error:', attendanceError);
        throw new Error(`Failed to fetch attendance: ${attendanceError.message}`);
      }

      if (!attendanceData || attendanceData.length === 0) {
        toast({
          title: 'No Data',
          description: 'No attendance records found for the selected criteria',
          variant: 'default',
        });
        return [];
      }

      // Add employee and department info to attendance records
      const enrichedAttendanceData: AttendanceRecord[] = attendanceData.map(record => {
        const employee = validEmployees.find(emp => emp.id === record.employee_id);
        const rosterData = Array.isArray(record.roster) ? record.roster[0] : record.roster;
        
        return {
          ...record,
          employee: {
            id: employee?.id || '',
            name: employee?.name || '',
            first_name: employee?.first_name || '',
            last_name: employee?.last_name || '',
            department_id: employee?.department_id || '',
            position: employee?.position || 'Unassigned',
            department: employee?.department || { id: '', name: 'Unassigned' }
          },
          roster: rosterData ? {
            id: rosterData.id,
            name: rosterData.name,
            start_time: rosterData.start_time,
            end_time: rosterData.end_time,
            break_duration: rosterData.break_duration,

            early_departure_threshold: rosterData.early_departure_threshold,
            is_active: rosterData.is_active,
            created_at: rosterData.created_at,
            updated_at: rosterData.updated_at
          } : null
        };
      });

      // Group attendance data by department for "All Departments" case
      if (selectedDepartment === 'all') {
        const departmentGroups = enrichedAttendanceData.reduce((groups, record) => {
          const deptId = record.employee?.department_id || 'unassigned';
          const deptName = record.employee?.department?.name || 'Unassigned';
          if (!groups[deptId]) {
            groups[deptId] = {
              name: deptName,
              records: []
            };
          }
          groups[deptId].records.push(record);
          return groups;
        }, {} as Record<string, { name: string; records: typeof enrichedAttendanceData }>);

        // Add department grouping to the records
        enrichedAttendanceData.forEach(record => {
          record.departmentGroup = record.employee?.department?.name || 'Unassigned';
        });
      }

      // Log successful data fetch
      console.log('Successfully fetched attendance data:', {
        recordCount: enrichedAttendanceData.length,
        dateRange: `${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}`,
        employeeCount: employeeIds.length,
        departments: departments
      });

      return enrichedAttendanceData;
    } catch (error) {
      console.error('Error in fetchAttendanceData:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch attendance data',
        variant: 'destructive',
      });
      return null;
    }
  };

  const generatePDF = async () => {
    setLoading(true);
    try {
      const attendanceData = await fetchAttendanceData();
      if (!attendanceData || attendanceData.length === 0) {
        setLoading(false);
        return;
      }

      // Initialize PDF with selected orientation
      const isLandscape = pdfOrientation === 'landscape';
      const doc = new jsPDF(pdfOrientation, 'mm', 'a4');
      const pageWidth = isLandscape ? 297 : 210;  // A4 width in mm
      const pageHeight = isLandscape ? 210 : 297; // A4 height in mm
      const margin = { top: 15, bottom: 15, left: 10, right: 10 };  // Equal margins for balanced layout
      const contentWidth = pageWidth - (margin.left + margin.right);  // Available width for content
      
      // Optimize font sizes for A4 layout
      const baseFontSize = 8;  // Adjusted for A4 size
      const headerFontSize = 11;  // Adjusted for A4 size
      
      // Set up department breakdown
      const departmentGroups = attendanceData.reduce((groups, record) => {
        const deptName = record.employee?.department?.name || 'Unassigned';
        if (!groups[deptName]) {
          groups[deptName] = [];
        }
        groups[deptName].push(record);
        return groups;
      }, {} as Record<string, typeof attendanceData>);

      // Optimized header for A4 layout
      const headerHeight = 25;  // Adjusted for A4 size
      // Draw filled rectangle for header background with gradient effect
      const gradientColors = {
        start: [41, 128, 185],  // Original blue
        end: [52, 152, 219]     // Lighter blue
      };
      
      // Create gradient background
      doc.setFillColor(gradientColors.start[0], gradientColors.start[1], gradientColors.start[2]);
      doc.rect(0, 0, pageWidth, headerHeight, 'F');
      
      // Add subtle header underline
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(margin.left, headerHeight - 1, pageWidth - margin.right, headerHeight - 1);
      
      // Title with enhanced styling
      doc.setFontSize(headerFontSize * 3);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('DUTCH TRAILS', pageWidth / 2, headerHeight * 0.35, { align: 'center' });

      // Subtitle with enhanced styling
      doc.setFontSize(headerFontSize * 2);
      doc.setFont('helvetica', 'normal');
      doc.text('ATTENDANCE REPORT', pageWidth / 2, headerHeight * 0.6, { align: 'center' });

      // Department with enhanced styling
      doc.setFontSize(headerFontSize * 1.5);
      doc.text(selectedDepartment === 'all' ? 'ALL DEPARTMENTS' : departments.find(d => d.id === selectedDepartment)?.name?.toUpperCase() || 'UNKNOWN DEPARTMENT', pageWidth / 2, headerHeight * 0.85, { align: 'center' });

      // Add date range and generation info - adjusted for right shift
      doc.setFontSize(baseFontSize);
      doc.setTextColor(44, 62, 80);
      const dateRange = `Period: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`;
      const generatedAt = `Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;
      const infoY = headerHeight + 10;
      doc.text(dateRange, margin.left + 5, infoY);  // Adjusted left position
      doc.text(generatedAt, pageWidth - margin.right - 5, infoY, { align: 'right' });  // Adjusted right position

      // If "All Departments" is selected, create a department breakdown
      if (selectedDepartment === 'all') {
        // Group data by department
        const departmentGroups = attendanceData.reduce((groups, record) => {
          const deptName = record.employee?.department?.name || 'Unassigned';
          if (!groups[deptName]) {
            groups[deptName] = [];
          }
          groups[deptName].push(record);
          return groups;
        }, {} as Record<string, typeof attendanceData>);

        let currentY = 70;

        // Ensure there's enough vertical space before drawing a block; otherwise, start a new page
        const ensureSpace = (requiredHeight: number) => {
          const availableHeight = pageHeight - margin.bottom - currentY;
          if (requiredHeight > availableHeight) {
            doc.addPage();
            currentY = 20;
          }
        };

        // Add department summaries
        Object.entries(departmentGroups).sort(([a], [b]) => a.localeCompare(b)).forEach(([deptName, records]) => {
          // We need space for the header (10) + summary (~25) before the table starts
          ensureSpace(10 + 25);

          // Add department header
          doc.setFillColor(240, 244, 248);
          doc.rect(margin.left, currentY, contentWidth, 10, 'F');
          doc.setFontSize(12);
          doc.setTextColor(41, 128, 185);
          doc.setFont('helvetica', 'bold');
          doc.text(deptName.toUpperCase(), margin.left + 2, currentY + 7);
          currentY += 15;

          // Calculate department statistics
          const totalEmployees = new Set(records.map(r => r.employee?.id)).size;
          const onTimeCount = records.filter(r => r.minutes_late === 0).length;
          const lateCount = records.filter(r => r.minutes_late > 0).length;
          const totalHours = records.reduce((sum, r) => sum + (r.working_duration_minutes || 0), 0) / 60;

          // Add department statistics
          doc.setFontSize(10);
          doc.setTextColor(44, 62, 80);
          doc.setFont('helvetica', 'normal');
          doc.text([
            `Total Employees: ${totalEmployees}`,
            `On Time: ${onTimeCount} (${Math.round((onTimeCount/records.length)*100)}%)`,
            `Late: ${lateCount} (${Math.round((lateCount/records.length)*100)}%)`,
            `Total Hours: ${Math.round(totalHours * 10) / 10}h`
          ], margin.left + 5, currentY, { lineHeightFactor: 1.5 });

          currentY += 25;

          // Ensure the table has enough starting space; if near bottom, move to new page
          ensureSpace(30);

          // Add department records table
          const W = (v: number) => Math.max(10, Math.round(v * (pdfWidthMode === 'compact' ? 0.9 : pdfWidthMode === 'wide' ? 1.1 : pdfWidthMode === 'xwide' ? 1.2 : 1)));
          (doc as any).autoTable({
            head: [['Date', 'Employee Name', 'Department', 'Roster Start', 'First In', 'First Out', 'Second In', 'Second Out', 'Break', 'Hours', 'Late', 'Status']],
            body: records.map(record => {
              // Calculate late duration
              let lateDuration = '-';
              if (record.first_check_in_time) {
                // Use roster-based late calculation with improved clarity
                if (record.first_check_in_time && record.roster) {
                  const calculation = calculateLateDuration(record.first_check_in_time, record.roster);
                  if (calculation.isLate) {
                    lateDuration = `LATE: ${calculation.formattedLateDuration}`;
                  } else {
                    lateDuration = 'ON TIME';
                  }
                } else if (record.minutes_late && record.minutes_late > 0) {
                  lateDuration = `LATE: ${formatDuration(record.minutes_late)}`;
                } else {
                  lateDuration = 'ON TIME';
                }
              }

              // Effective roster start with department override
              const rosterStartValue = getEffectiveRosterStart(record);

              return [
              format(new Date(record.date), 'dd/MM/yyyy'),
              record.employee?.first_name && record.employee?.last_name 
                ? `${record.employee.first_name} ${record.employee.last_name}`
                : record.employee?.name || 'Unknown',
              record.employee?.department?.name || '-',
              rosterStartValue,
              record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-',
              record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-',
              record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-',
              record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-',
              formatDuration(record.break_duration_minutes),
              formatDuration(record.working_duration_minutes),
              lateDuration.replace('LATE: ', ''),
              record.status?.toUpperCase() || 'UNKNOWN'
              ];
            }),
            startY: currentY,
            theme: 'grid',
                      styles: {
            font: 'helvetica',
            fontSize: baseFontSize,
            cellPadding: 2.5,  // Slightly increased padding
            lineColor: [180, 180, 180],  // Darker lines
            lineWidth: 0.1,  // Thin lines for clean look
            minCellHeight: 7,  // Slightly increased height
            valign: 'middle',  // Vertical alignment
            halign: 'center',  // Horizontal alignment for most cells
            overflow: 'linebreak',  // Handle text overflow
            fillColor: false,  // No background color
          },
            columnStyles: {
              0: { cellWidth: 20 },  // Date
              1: { cellWidth: 35 },  // Employee Name
              2: { cellWidth: 30 },  // Department
              3: { cellWidth: 20 },  // Roster Start
              4: { cellWidth: 15 },  // First In
              5: { cellWidth: 15 },  // First Out
              6: { cellWidth: 15 },  // Second In
              7: { cellWidth: 15 },  // Second Out
              8: { cellWidth: 15 },  // Break
              9: { cellWidth: 15 },  // Hours
              10: { 
                cellWidth: 20,  // Late
                fontStyle: 'bold',
                textColor: (cell) => {
                  const value = cell.raw || '';
                  return value.startsWith('LATE:') ? [220, 38, 38] : [46, 125, 50];
                }
              },
              11: { cellWidth: 20 }  // Status
            },
            headStyles: {
              fillColor: [41, 128, 185],
              textColor: 255,
              fontSize: 8,
              fontStyle: 'bold',
            },
            alternateRowStyles: {
              fillColor: [245, 245, 245],
            },
            margin: { top: headerHeight + 20, bottom: margin.bottom, left: margin.left, right: margin.right },
          });

          currentY = (doc as any).lastAutoTable.finalY + 20;
        });
      } else {
        // Original single department table
        (doc as any).autoTable({
          head: [['Date', 'Employee Name', 'Department', 'Roster Start', 'First In', 'First Out', 'Second In', 'Second Out', 'Break', 'Hours', 'Late', 'Status']],
          body: attendanceData.map(record => {
            // Calculate late duration using roster start time with improved clarity
            let lateDuration = '-';
            if (record.first_check_in_time && record.roster) {
              const calculation = calculateLateDuration(record.first_check_in_time, withDepartmentOverride(record.roster, record) as any);
              if (calculation.isLate) {
                lateDuration = `LATE: ${calculation.formattedLateDuration}`;
              } else {
                lateDuration = 'ON TIME';
              }
            } else if (record.minutes_late && record.minutes_late > 0) {
              lateDuration = `LATE: ${formatDuration(record.minutes_late)}`;
            } else {
              lateDuration = 'ON TIME';
            }

            return [
              format(new Date(record.date), 'dd/MM/yyyy'),
              record.employee?.first_name && record.employee?.last_name 
                ? `${record.employee.first_name} ${record.employee.last_name}`
                : record.employee?.name || 'Unknown',
              record.employee?.department?.name || '-',
              getEffectiveRosterStart(record),
              record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-',
              record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-',
              record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-',
              record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-',
              formatDuration(record.break_duration_minutes),
              formatDuration(record.working_duration_minutes),
              lateDuration.replace('LATE: ', ''),
              record.status?.toUpperCase() || 'UNKNOWN'
            ];
          }),
          startY: 115,
          theme: 'grid',
          styles: {
            font: 'helvetica',
              fontSize: baseFontSize,
              cellPadding: 1.5,  // Reduced padding for mobile
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
              minCellHeight: 6,  // Ensure minimum height for mobile
              valign: 'middle',  // Vertical alignment
              halign: 'center',  // Horizontal alignment
              overflow: 'linebreak',  // Handle text overflow
            },
                      columnStyles: {
            0: { cellWidth: 20 },  // Date
            1: { cellWidth: 35 },  // Employee Name
            2: { cellWidth: 30 },  // Department
            3: { cellWidth: 20 },  // Roster Start
            4: { cellWidth: 20 },  // First In
            5: { cellWidth: 20 },  // First Out
            6: { cellWidth: 20 },  // Second In
            7: { cellWidth: 20 },  // Second Out
            8: { cellWidth: 20 },  // Break
            9: { cellWidth: 20 },  // Hours
            10: { 
              cellWidth: 22,  // Late
              fontStyle: 'bold',
              fontSize: baseFontSize,
              textColor: (cell) => {
                const value = cell.raw || '';
                return value.startsWith('LATE:') ? [220, 38, 38] : [46, 125, 50];
              }
            },
            11: { cellWidth: 30 }  // Status - Increased width for better visibility
          },
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontSize: baseFontSize,
            fontStyle: 'bold',
            minCellHeight: 8,  // Slightly taller header cells
            valign: 'middle',
            halign: 'center',
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245],
          },
          margin: { top: 115, bottom: margin.bottom, left: margin.left, right: margin.right },
        });
      }

      // Add responsive footer
      doc.setFontSize(baseFontSize * 0.9);  // Slightly smaller than base font
      doc.setTextColor(128, 128, 128);
      const footerText = 'This report is system generated and does not require signature.';
      const footerY = pageHeight - margin.bottom;
      
      // Add page numbers to footer
      const pageInfo = `Page ${doc.getCurrentPageInfo().pageNumber} of ${doc.getNumberOfPages()}`;
      
      // Two-line footer for better mobile readability
      doc.text(footerText, pageWidth / 2, footerY - 4, { align: 'center' });
      doc.text(pageInfo, pageWidth / 2, footerY, { align: 'center' });

      // Save the PDF
      const filename = `attendance_report_${selectedDepartment === 'all' ? 'all_departments' : departments.find(d => d.id === selectedDepartment)?.name?.toLowerCase()}_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.pdf`;
      doc.save(filename);

      toast({
        title: 'Success',
        description: 'PDF report generated successfully',
      });

      setIsDialogOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error generating PDF report:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate PDF report',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Generate a PNG image of the invoice-like report and share to WhatsApp when possible
  const generateSummaryText = (data: AttendanceRecord[]) => {
    // Calculate summary statistics
    const totalEmployees = new Set(data.map(r => r.employee?.id)).size;
    const onTimeCount = data.filter(r => r.minutes_late === 0).length;
    const lateCount = data.filter(r => r.minutes_late > 0).length;
    const totalHours = data.reduce((sum, r) => sum + (r.working_duration_minutes || 0), 0) / 60;

    // Group by department
    const departmentGroups = data.reduce((groups, record) => {
      const deptName = record.employee?.department?.name || 'Unassigned';
      if (!groups[deptName]) {
        groups[deptName] = {
          total: 0,
          onTime: 0,
          late: 0,
          hours: 0
        };
      }
      groups[deptName].total++;
      if (record.minutes_late === 0) groups[deptName].onTime++;
      if (record.minutes_late > 0) groups[deptName].late++;
      groups[deptName].hours += (record.working_duration_minutes || 0) / 60;
      return groups;
    }, {} as Record<string, { total: number; onTime: number; late: number; hours: number }>);

    // Generate the summary text
    let summaryText = `*DUTCH TRAILS - ATTENDANCE SUMMARY*\n`;
    summaryText += `📅 Period: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}\n\n`;
    
    // Overall summary
    summaryText += `*Overall Summary:*\n`;
    summaryText += `👥 Total Employees: ${totalEmployees}\n`;
    summaryText += `✅ On Time: ${onTimeCount} (${Math.round((onTimeCount/data.length)*100)}%)\n`;
    summaryText += `⏰ Late: ${lateCount} (${Math.round((lateCount/data.length)*100)}%)\n`;
    summaryText += `⌛ Total Hours: ${Math.round(totalHours * 10) / 10}h\n\n`;

    // Department breakdown
    if (Object.keys(departmentGroups).length > 1) {
      summaryText += `*Department Breakdown:*\n`;
      Object.entries(departmentGroups).sort(([a], [b]) => a.localeCompare(b)).forEach(([dept, stats]) => {
        summaryText += `\n📍 *${dept}*\n`;
        summaryText += `- Total: ${stats.total}\n`;
        summaryText += `- On Time: ${stats.onTime} (${Math.round((stats.onTime/stats.total)*100)}%)\n`;
        summaryText += `- Late: ${stats.late} (${Math.round((stats.late/stats.total)*100)}%)\n`;
        summaryText += `- Hours: ${Math.round(stats.hours * 10) / 10}h\n`;
      });
    }

    // Late employees list (limited to first 10)
    const lateEmployees = data.filter(r => r.minutes_late > 0)
      .sort((a, b) => (b.minutes_late || 0) - (a.minutes_late || 0))
      .slice(0, 10);

    if (lateEmployees.length > 0) {
      summaryText += `\n*Top Late Arrivals:*\n`;
      lateEmployees.forEach(record => {
        const name = record.employee?.first_name && record.employee?.last_name
          ? `${record.employee.first_name} ${record.employee.last_name}`
          : record.employee?.name || 'Unknown';
        summaryText += `- ${name}: ${formatDuration(record.minutes_late)} late\n`;
      });
    }

    summaryText += `\n_Generated on ${format(new Date(), 'dd/MM/yyyy HH:mm')}_`;
    return summaryText;
  };

  const shareHybridReport = async () => {
    try {
      if (!reportData || reportData.length === 0) {
        const data = await fetchAttendanceData();
        if (!data || data.length === 0) {
          return;
        }
        setReportData(data);
      }

      setSharing(true);

      // Generate both text summary and image
      const summaryText = generateSummaryText(reportData);
      
      if (!invoiceRef.current) {
        toast({
          title: 'Error',
          description: 'Unable to prepare report image',
          variant: 'destructive',
        });
        return;
      }

      // Generate image
      const mod = await import('html2canvas');
      const html2canvas = (mod as any).default ?? (mod as any);
      await new Promise((r) => setTimeout(r, 50));
      const canvas = await html2canvas(invoiceRef.current, {
        scale: Math.max(2, Math.floor(window.devicePixelRatio || 2)),
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        removeContainer: true,
      });
      const dataUrl = canvas.toDataURL('image/png');

      // Convert to file
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mimeString });
      const fileName = `present_report_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Try native share if available
      if (typeof (navigator as any).canShare === 'function' && (navigator as any).canShare({ files: [file] })) {
        try {
          await (navigator as any).share({
            title: 'Present Employee Report',
            text: summaryText,
            files: [file]
          });
          toast({ title: 'Shared', description: 'Report shared successfully' });
          return;
        } catch (_err) {
          // Fall back to WhatsApp share
        }
      }

      // Download image and share text via WhatsApp
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Open WhatsApp with text summary
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText + '\n\nImage has been downloaded. Please attach it from your gallery/files.')}`;
      window.open(whatsappUrl, '_blank');

      toast({
        title: 'Success',
        description: 'Report prepared for sharing',
      });
    } catch (error) {
      console.error('Error sharing hybrid report:', error);
      toast({
        title: 'Error',
        description: 'Failed to prepare report for sharing',
        variant: 'destructive',
      });
    } finally {
      setSharing(false);
    }
  };

  const shareTextOnWhatsApp = async () => {
    try {
      if (!reportData || reportData.length === 0) {
        const data = await fetchAttendanceData();
        if (!data || data.length === 0) {
          return;
        }
        setReportData(data);
      }

      setSharing(true);
      const summaryText = generateSummaryText(reportData);
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;
      window.open(whatsappUrl, '_blank');

      toast({
        title: 'Success',
        description: 'WhatsApp sharing initiated',
      });
    } catch (error) {
      console.error('Error sharing to WhatsApp:', error);
      toast({
        title: 'Error',
        description: 'Failed to share report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSharing(false);
    }
  };

  const shareOnWhatsApp = async () => {
    try {
      if (!reportData || reportData.length === 0) {
        const data = await fetchAttendanceData();
        if (!data || data.length === 0) {
          return;
        }
        setReportData(data);
      }

      if (!invoiceRef.current) {
        toast({
          title: 'Error',
          description: 'Unable to prepare invoice for sharing',
          variant: 'destructive',
        });
        return;
      }

      setSharing(true);
      // Use html2canvas to generate PNG (robust ESM interop)
      const mod = await import('html2canvas');
      const html2canvas = (mod as any).default ?? (mod as any);
      // Give the browser a tick to ensure layout is stable
      await new Promise((r) => setTimeout(r, 50));
      const canvas = await html2canvas(invoiceRef.current, {
        scale: Math.max(2, Math.floor(window.devicePixelRatio || 2)),
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        removeContainer: true,
      });
      const dataUrl = canvas.toDataURL('image/png');

      // Convert dataURL to Blob safely
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mimeString });
      const fileName = `present_report_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const shareText = `Present Employee Report\nPeriod: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}\n${selectedDepartment === 'all' ? 'All Departments' : (departments.find(d => d.id === selectedDepartment)?.name || '')}`.trim();

      if (typeof (navigator as any).canShare === 'function' && (navigator as any).canShare({ files: [file] })) {
        try {
          await (navigator as any).share({
            title: 'Present Employee Report',
            text: shareText,
            files: [file]
          });
          toast({ title: 'Shared', description: 'Report shared successfully' });
          return;
        } catch (_err) {
          // If native share is cancelled or fails, continue with WhatsApp fallback
        }
      }

      // Fallback: trigger download and open WhatsApp text share
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n\nImage downloaded. Please attach it from your gallery/files.')}`;
      const wa = document.createElement('a');
      wa.href = whatsappUrl;
      wa.target = '_blank';
      document.body.appendChild(wa);
      wa.click();
      wa.remove();
    } catch (error) {
      console.error('Error sharing to WhatsApp:', error);
      toast({
        title: 'Error',
        description: 'Failed to share report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSharing(false);
    }
  };

  const handlePrint = async () => {
    try {
      setLoading(true);
      const attendanceData = await fetchAttendanceData();
      if (!attendanceData || attendanceData.length === 0) {
        return;
      }

      // Generate PDF with current orientation
      const isLandscape = pdfOrientation === 'landscape';
      const doc = new jsPDF(pdfOrientation, 'mm', 'a4');
      const pageWidth = isLandscape ? 297 : 210;
      const pageHeight = isLandscape ? 210 : 297;
      const margin = { top: 15, bottom: 15, left: 10, right: 10 };
      const contentWidth = pageWidth - (margin.left + margin.right);

      // Optimize font sizes for current orientation
      const baseFontSize = isLandscape ? 8 : 7;
      const headerFontSize = isLandscape ? 11 : 10;

      // Add header
      const headerHeight = 25;
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, headerHeight, 'F');
      
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(margin.left, headerHeight - 1, pageWidth - margin.right, headerHeight - 1);
      
      // Title
      doc.setFontSize(headerFontSize * 3);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('DUTCH TRAILS', pageWidth / 2, headerHeight * 0.35, { align: 'center' });

      // Subtitle
      doc.setFontSize(headerFontSize * 2);
      doc.setFont('helvetica', 'normal');
      doc.text('ATTENDANCE REPORT', pageWidth / 2, headerHeight * 0.6, { align: 'center' });

      // Department
      doc.setFontSize(headerFontSize * 1.5);
      doc.text(
        selectedDepartment === 'all' 
          ? 'ALL DEPARTMENTS' 
          : departments.find(d => d.id === selectedDepartment)?.name?.toUpperCase() || 'UNKNOWN DEPARTMENT',
        pageWidth / 2,
        headerHeight * 0.85,
        { align: 'center' }
      );

      // Add date range and generation info
      doc.setFontSize(baseFontSize);
      doc.setTextColor(44, 62, 80);
      const dateRange = `Period: ${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`;
      const generatedAt = `Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`;
      const infoY = headerHeight + 10;
      doc.text(dateRange, margin.left + 5, infoY);
      doc.text(generatedAt, pageWidth - margin.right - 5, infoY, { align: 'right' });

      // Add table
      (doc as any).autoTable({
        head: [['Date', 'Employee Name', 'Department', 'Roster Start', 'First In', 'First Out', 'Second In', 'Second Out', 'Break', 'Hours', 'Late', 'Status']],
        body: attendanceData.map(record => {
          // Calculate late duration
          let lateDuration = '-';
          if (record.first_check_in_time && record.roster) {
            const calculation = calculateLateDuration(record.first_check_in_time, withDepartmentOverride(record.roster, record) as any);
            if (calculation.isLate) {
              lateDuration = `LATE: ${calculation.formattedLateDuration}`;
            } else {
              lateDuration = 'ON TIME';
            }
          } else if (record.minutes_late && record.minutes_late > 0) {
            lateDuration = `LATE: ${formatDuration(record.minutes_late)}`;
          } else {
            lateDuration = 'ON TIME';
          }

          return [
            format(new Date(record.date), 'dd/MM/yyyy'),
            record.employee?.first_name && record.employee?.last_name 
              ? `${record.employee.first_name} ${record.employee.last_name}`
              : record.employee?.name || 'Unknown',
            record.employee?.department?.name || '-',
            getEffectiveRosterStart(record),
            record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-',
            record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-',
            record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-',
            record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-',
            formatDuration(record.break_duration_minutes),
            formatDuration(record.working_duration_minutes),
            lateDuration.replace('LATE: ', ''),
            record.status?.toUpperCase() || 'UNKNOWN'
          ];
        }),
        startY: headerHeight + 20,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: baseFontSize,
          cellPadding: 2,
          lineColor: [180, 180, 180],
          lineWidth: 0.1,
          minCellHeight: 6,
          valign: 'middle',
          halign: 'center',
          overflow: 'linebreak'
        },
        columnStyles: isLandscape ? {
          0: { cellWidth: 23 },  // Date
          1: { cellWidth: 40 },  // Employee Name
          2: { cellWidth: 35 },  // Department
          3: { cellWidth: 23 },  // Roster Start
          4: { cellWidth: 23 },  // First In
          5: { cellWidth: 23 },  // First Out
          6: { cellWidth: 23 },  // Second In
          7: { cellWidth: 23 },  // Second Out
          8: { cellWidth: 23 },  // Break
          9: { cellWidth: 23 },  // Hours
          10: { 
            cellWidth: 25,  // Late
            fontStyle: 'bold',
            textColor: (cell) => {
              const value = cell.raw || '';
              return value.startsWith('LATE:') ? [220, 38, 38] : [46, 125, 50];
            }
          },
          11: { cellWidth: 25 }  // Status
        } : {
          0: { cellWidth: 16 },  // Date
          1: { cellWidth: 22 },  // Employee Name
          2: { cellWidth: 22 },  // Department
          3: { cellWidth: 16 },  // Roster Start
          4: { cellWidth: 14 },  // First In
          5: { cellWidth: 14 },  // First Out
          6: { cellWidth: 14 },  // Second In
          7: { cellWidth: 14 },  // Second Out
          8: { cellWidth: 14 },  // Break
          9: { cellWidth: 14 },  // Hours
          10: { 
            cellWidth: 16,  // Late
            fontStyle: 'bold',
            textColor: (cell) => {
              const value = cell.raw || '';
              return value.startsWith('LATE:') ? [220, 38, 38] : [46, 125, 50];
            }
          },
          11: { cellWidth: 24 }  // Status - Increased width for better visibility
        },
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontSize: baseFontSize,
          fontStyle: 'bold',
          minCellHeight: 8,
          valign: 'middle',
          halign: 'center',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: { top: headerHeight + 20, bottom: margin.bottom, left: margin.left, right: margin.right },
      });

      // Add footer
      doc.setFontSize(baseFontSize * 0.9);
      doc.setTextColor(128, 128, 128);
      const footerText = 'This report is system generated and does not require signature.';
      const footerY = pageHeight - margin.bottom;
      const pageInfo = `Page ${doc.getCurrentPageInfo().pageNumber} of ${doc.getNumberOfPages()}`;
      doc.text(footerText, pageWidth / 2, footerY - 4, { align: 'center' });
      doc.text(pageInfo, pageWidth / 2, footerY, { align: 'center' });

      // Open print dialog
      doc.autoPrint();
      doc.output('dataurlnewwindow');

      toast({
        title: 'Success',
        description: 'Print dialog opened',
      });
    } catch (error) {
      console.error('Error printing report:', error);
      toast({
        title: 'Error',
        description: 'Failed to print report',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    const data = await fetchAttendanceData();
    if (data) {
      setReportData(data);
    }
  };

  const renderPreviewTable = (data: AttendanceRecord[]) => {
    // Get the department title - handle "All Departments" case
    const departmentTitle = selectedDepartment === 'all' 
      ? 'All Departments' 
      : departments.find(d => d.id === selectedDepartment)?.name || 'Unknown Department';
    
    // Calculate statistics
    const totalEmployees = new Set(data.map(record => record.employee?.id)).size;
    const totalDays = new Set(data.map(record => record.date)).size;
    const onTimeCount = data.filter(record => record.minutes_late === 0).length;
    const lateCount = data.filter(record => record.minutes_late > 0).length;
    const totalHours = data.reduce((sum, record) => sum + (record.working_duration_minutes || 0), 0) / 60;

    return (
      <div className="space-y-4">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEmployees}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Total Days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDays}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">On Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{onTimeCount}</div>
              <div className="text-xs text-muted-foreground">
                {Math.round((onTimeCount/data.length)*100)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Late</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{lateCount}</div>
              <div className="text-xs text-muted-foreground">
                {Math.round((lateCount/data.length)*100)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(totalHours * 10) / 10}h</div>
            </CardContent>
          </Card>
        </div>

        {/* Mobile Card View */}
        <div className="block sm:hidden">
          {data.slice(0, 5).map((record) => (
            <Card key={record.id} className="mb-4">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Date:</span>
                    <span className="text-sm">{format(new Date(record.date), 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Employee:</span>
                    <span className="text-sm">
                      {record.employee?.first_name && record.employee?.last_name 
                        ? `${record.employee.first_name} ${record.employee.last_name}`
                        : record.employee?.name || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Department:</span>
                    <span className="text-sm">
                      {record.employee?.department?.name || departmentTitle || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Roster Start:</span>
                    <span className="text-sm">
                      {getEffectiveRosterStart(record)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">First In:</span>
                    <span className="text-sm">
                      {record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">First Out:</span>
                    <span className="text-sm">
                      {record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Second In:</span>
                    <span className="text-sm">
                      {record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Second Out:</span>
                    <span className="text-sm">
                      {record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Break:</span>
                    <span className="text-sm">{formatDuration(record.break_duration_minutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Duration:</span>
                    <span className="text-sm">{formatDuration(record.working_duration_minutes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Late Status:</span>
                    <span className={`text-sm ${record.first_check_in_time && (() => {
                      if (record.first_check_in_time && record.roster) {
                        const calculation = calculateLateDuration(record.first_check_in_time, withDepartmentOverride(record.roster, record) as any);
                        return calculation.isLate ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
                      }
                      return record.minutes_late && record.minutes_late > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
                    })()}`}>
                      {record.first_check_in_time ? (() => {
                        // Use roster-based late calculation with improved clarity
                        if (record.first_check_in_time && record.roster) {
                          const calculation = calculateLateDuration(record.first_check_in_time, withDepartmentOverride(record.roster, record) as any);
                          if (calculation.isLate) {
                            return `LATE: ${calculation.formattedLateDuration}`;
                          }
                          return 'ON TIME';
                        } else if (record.minutes_late && record.minutes_late > 0) {
                          return `LATE: ${formatDuration(record.minutes_late)}`;
                        }
                        return 'ON TIME';
                      })() : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Status:</span>
                    <span className="text-sm">{getEffectiveStatus(record).toUpperCase()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {data.length > 5 && (
            <div className="text-center text-xs text-muted-foreground">
              Showing 5 of {data.length} records. Download PDF for complete list.
            </div>
          )}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-center text-xs font-medium">Date</th>
                  <th className="p-2 text-left text-xs font-medium">Employee</th>
                  <th className="p-2 text-center text-xs font-medium">Department</th>
                  <th className="p-2 text-center text-xs font-medium">Roster Start</th>
                  <th className="p-2 text-center text-xs font-medium">First In</th>
                  <th className="p-2 text-center text-xs font-medium">First Out</th>
                  <th className="p-2 text-center text-xs font-medium">Second In</th>
                  <th className="p-2 text-center text-xs font-medium">Second Out</th>
                  <th className="p-2 text-center text-xs font-medium">Break</th>
                  <th className="p-2 text-center text-xs font-medium">Duration</th>
                  <th className="p-2 text-center text-xs font-medium">Late</th>
                  <th className="p-2 text-center text-xs font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((record) => (
                  <tr key={record.id} className="border-b hover:bg-muted/50">
                    <td className="p-2 text-center text-xs">
                      {format(new Date(record.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="p-2 text-left text-xs">
                      {record.employee?.first_name && record.employee?.last_name 
                        ? `${record.employee.first_name} ${record.employee.last_name}`
                        : record.employee?.name || 'Unknown'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.employee?.department?.name || departmentTitle || '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      <RosterStartEditor record={record} onUpdate={handleRefresh} />
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {formatDuration(record.break_duration_minutes)}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {formatDuration(record.working_duration_minutes)}
                    </td>
                    <td className={`p-2 text-center text-xs ${record.first_check_in_time && (() => {
                      if (record.first_check_in_time && record.roster) {
                        const calculation = calculateLateDuration(record.first_check_in_time, withDepartmentOverride(record.roster, record) as any);
                        return calculation.isLate ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
                      }
                      return record.minutes_late && record.minutes_late > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
                    })()}`}>
                      {record.first_check_in_time ? (() => {
                        // Use roster-based late calculation with improved clarity
                        if (record.first_check_in_time && record.roster) {
                          const calculation = calculateLateDuration(record.first_check_in_time, withDepartmentOverride(record.roster, record) as any);
                          if (calculation.isLate) {
                            return `LATE: ${calculation.formattedLateDuration}`;
                          }
                          return 'ON TIME';
                        } else if (record.minutes_late && record.minutes_late > 0) {
                          return `LATE: ${formatDuration(record.minutes_late)}`;
                        }
                        return 'ON TIME';
                      })() : '-'}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {getEffectiveStatus(record).toUpperCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        className="flex items-center gap-2 w-full sm:w-auto"
        variant="outline"
        size="sm"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Present Report</span>
        <span className="sm:hidden">Present</span>
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Generate Present Employee Report</DialogTitle>
          </DialogHeader>

          <div className={cn("space-y-4", className)}>
            <div className="flex flex-col gap-4">
              <div className="space-y-3">
                <label className="text-sm font-medium">Select Date Range</label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Start Date</label>
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => date && setStartDate(date)}
                      className="rounded-md border w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">End Date</label>
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => date && setEndDate(date)}
                      className="rounded-md border w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Department</label>
                <Select value={selectedDepartment} onValueChange={handleDepartmentChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department">
                      {departments.find(d => d.id === selectedDepartment)?.name || 'Select department'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  onClick={handleRefresh}
                  variant="outline"
                  size="sm"
                  disabled={loading || !startDate || !endDate}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="sm:hidden">Refresh</span>
                </Button>
                <div className="text-sm text-muted-foreground">
                  {reportData.length > 0 && `${reportData.length} records found`}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Orientation:</label>
                  <Select value={pdfOrientation} onValueChange={(value: 'portrait' | 'landscape') => setPdfOrientation(value)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="landscape">Landscape</SelectItem>
                      <SelectItem value="portrait">Portrait</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={generatePDF}
                  disabled={loading || !startDate || !endDate}
                  className="flex items-center gap-2 w-full sm:w-auto"
                  size="sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </>
                  )}
                </Button>

                <Button
                  onClick={handlePrint}
                  disabled={loading || !startDate || !endDate}
                  className="flex items-center gap-2 w-full sm:w-auto"
                  size="sm"
                  variant="secondary"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Printing...
                    </>
                  ) : (
                    <>
                      <Printer className="h-4 w-4" />
                      Print Report
                    </>
                  )}
                </Button>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative">
                    <Button
                      onClick={() => setIsShareMenuOpen(!isShareMenuOpen)}
                      disabled={sharing || !startDate || !endDate || reportData.length === 0}
                      className="flex items-center gap-2 w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                    >
                      {sharing ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sharing...
                        </>
                      ) : (
                        <>
                          <Share className="h-4 w-4" />
                          Share on WhatsApp
                        </>
                      )}
                    </Button>
                    {isShareMenuOpen && (
                      <div className="absolute z-10 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                        <div className="py-1" role="menu" aria-orientation="vertical">
                          <button
                            onClick={() => {
                              setIsShareMenuOpen(false);
                              shareTextOnWhatsApp();
                            }}
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full"
                            role="menuitem"
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Share as Text Summary
                          </button>
                          <button
                            onClick={() => {
                              setIsShareMenuOpen(false);
                              shareOnWhatsApp();
                            }}
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full"
                            role="menuitem"
                          >
                            <Image className="h-4 w-4 mr-2" />
                            Share as Image
                          </button>
                          <button
                            onClick={() => {
                              setIsShareMenuOpen(false);
                              shareHybridReport();
                            }}
                            className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full"
                            role="menuitem"
                          >
                            <FileSpreadsheet className="h-4 w-4 mr-2" />
                            Share Summary + Image
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {reportData.length > 0 && renderPreviewTable(reportData)}
          </div>
          {/* Offscreen invoice container for PNG generation */}
          <div
            ref={invoiceRef}
            style={{ position: 'fixed', left: '-10000px', top: 0, width: '794px', background: '#ffffff', color: '#111827', padding: '16px', zIndex: -1 }}
          >
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: 700 }}>DUTCH TRAILS</div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>Present Employee Report</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Period</div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>
                    {`${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`}
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '4px', color: '#6b7280' }}>
                    {selectedDepartment === 'all' ? 'All Departments' : departments.find(d => d.id === selectedDepartment)?.name || 'Department'}
                  </div>
                </div>
              </div>

              {/* Summary Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
                {(() => {
                  const totalEmployees = new Set(reportData.map(r => r.employee?.id)).size;
                  const onTimeCount = reportData.filter(r => r.minutes_late === 0).length;
                  const lateCount = reportData.filter(r => r.minutes_late > 0).length;
                  const totalHours = reportData.reduce((sum, r) => sum + (r.working_duration_minutes || 0), 0) / 60;
                  return (
                    <>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Employees</div>
                        <div style={{ fontSize: '18px', fontWeight: 700 }}>{totalEmployees}</div>
                      </div>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>On Time</div>
                        <div style={{ fontSize: '18px', fontWeight: 700 }}>{onTimeCount}</div>
                      </div>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Late</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>{lateCount}</div>
                      </div>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Total Hours</div>
                        <div style={{ fontSize: '18px', fontWeight: 700 }}>{Math.round(totalHours * 10) / 10}h</div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    {['Date','Employee','Roster Start','First In','First Out','Second In','Second Out','Hours','Late'].map((h) => (
                      <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb', padding: '8px 6px', background: '#f3f4f6' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.slice(0, 30).map((record) => {
                    const name = record.employee?.first_name && record.employee?.last_name
                      ? `${record.employee.first_name} ${record.employee.last_name}`
                      : record.employee?.name || 'Unknown';
                    const lateText = record.first_check_in_time && record.roster
                      ? (() => {
                          const calc = calculateLateDuration(record.first_check_in_time!, record.roster!);
                          return calc.isLate ? `LATE: ${calc.formattedLateDuration}` : 'ON TIME';
                        })()
                      : (record.minutes_late > 0 ? `LATE: ${formatDuration(record.minutes_late)}` : 'ON TIME');
                    return (
                      <tr key={record.id}>
                        <td style={{ padding: '6px' }}>{format(new Date(record.date), 'dd/MM/yyyy')}</td>
                        <td style={{ padding: '6px' }}>{name}</td>
                        <td style={{ padding: '6px' }}>{getEffectiveRosterStart(record)}</td>
                        <td style={{ padding: '6px' }}>{record.first_check_in_time ? format(new Date(record.first_check_in_time), 'HH:mm') : '-'}</td>
                        <td style={{ padding: '6px' }}>{record.first_check_out_time ? format(new Date(record.first_check_out_time), 'HH:mm') : '-'}</td>
                        <td style={{ padding: '6px' }}>{record.second_check_in_time ? format(new Date(record.second_check_in_time), 'HH:mm') : '-'}</td>
                        <td style={{ padding: '6px' }}>{record.second_check_out_time ? format(new Date(record.second_check_out_time), 'HH:mm') : '-'}</td>
                        <td style={{ padding: '6px' }}>{formatDuration(record.working_duration_minutes)}</td>
                        <td style={{ padding: '6px', fontWeight: 700, color: lateText.startsWith('LATE') ? '#dc2626' : '#16a34a' }}>{lateText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{ marginTop: '12px', fontSize: '10px', color: '#6b7280', textAlign: 'center' }}>
                Generated on {format(new Date(), 'dd/MM/yyyy HH:mm')} · Dutch Trails
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
