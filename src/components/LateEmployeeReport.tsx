import React, { useState, useEffect } from 'react';
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
  FileSpreadsheet
} from 'lucide-react';
import { format, startOfDay, endOfDay, parseISO, differenceInMinutes } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calculateLateDuration, formatLateDuration } from '@/utils/lateDurationUtils';
import { getEmployeeRosterForDate } from '@/utils/rosterUtils';

interface LateEmployee {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  first_check_in: string | null;
  roster_start_time: string;
  late_minutes: number;
  late_duration: string;
  department: string;
  position: string;
}

interface Department {
  id: string;
  name: string;
}

interface LateEmployeeReportProps {
  className?: string;
  onSuccess?: () => void;
}

interface RosterInfo {
  id: string;
  employee_id: string;
  start_time: string;
  end_time: string;
  break_duration: number;
  created_at: string;
  updated_at: string;
}

interface AttendanceRecord {
  id: string;
  date: string;
  first_check_in_time: string | null;
  first_check_out_time: string | null;
  second_check_in_time: string | null;
  second_check_out_time: string | null;
  status: string;
  minutes_late: number;
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

export function LateEmployeeReport({ className, onSuccess }: LateEmployeeReportProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [lateEmployees, setLateEmployees] = useState<LateEmployee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [showCalendar, setShowCalendar] = useState<boolean>(false);
  
  const { toast } = useToast();

  // Fetch departments on component mount
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabase
          .from('departments')
          .select('id, name')
          .order('name');

        if (error) throw error;
        setDepartments(data || []);
      } catch (error) {
        console.error('Error fetching departments:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to fetch departments"
        });
      }
    };

    fetchDepartments();
  }, []);

  // Fetch late employees data
  const fetchLateEmployees = async (date: Date) => {
    try {
      setLoading(true);
      const dateStr = format(date, 'yyyy-MM-dd');
      
      // Query attendance records for the selected date with rosters
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
          minutes_late,
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
        .not('first_check_in_time', 'is', null); // Only get records with check-in times

      if (attendanceError) {
        console.error('Error fetching attendance:', attendanceError);
        throw attendanceError;
      }

      // Get roster information for each employee for the specific date
      const lateEmployeesWithRoster: LateEmployee[] = [];
      
      for (const record of attendanceData || []) {
        if (!record.first_check_in_time || !record.employees) continue;

        try {
          // Get the employee's roster for this date
          const roster = await getEmployeeRosterForDate(record.employee_id, dateStr);
          
          if (!roster) {
            console.warn(`No roster found for employee ${record.employee_id} on ${dateStr}`);
            continue;
          }

          // Calculate late duration based on roster start time
          const lateDurationCalc = calculateLateDuration(record.first_check_in_time, roster);
          
          // Only include if employee is actually late
          if (lateDurationCalc.isLate && lateDurationCalc.lateMinutes > 0) {
            const employee = record.employees;
            const employeeName = employee.name || `${employee.first_name || ''} ${employee.last_name || ''}`.trim() || 'Unknown';
            
            lateEmployeesWithRoster.push({
              id: record.id,
              employee_id: record.employee_id,
              employee_name: employeeName,
              date: record.date,
              first_check_in: record.first_check_in_time,
              roster_start_time: roster.start_time,
              late_minutes: lateDurationCalc.lateMinutes,
              late_duration: lateDurationCalc.formattedLateDuration,
              department: employee.department?.name || 'Unknown',
              position: employee.position || 'Unknown'
            });
          }
        } catch (error) {
          console.error(`Error processing employee ${record.employee_id}:`, error);
        }
      }

      setLateEmployees(lateEmployeesWithRoster);
      
      if (lateEmployeesWithRoster.length === 0) {
        toast({
          title: "No Late Employees",
          description: `No late employees found for ${format(date, 'PPP')}`
        });
      }

    } catch (error) {
      console.error('Error fetching late employees:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch late employee data"
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter employees based on department and search term
  const filteredEmployees = lateEmployees.filter(employee => {
    const matchesDepartment = selectedDepartment === 'all' || 
      employee.department.toLowerCase() === selectedDepartment.toLowerCase();
    const matchesSearch = employee.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.department.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesDepartment && matchesSearch;
  });

  // Group employees by department
  const employeesByDepartment = filteredEmployees.reduce((acc, employee) => {
    const dept = employee.department;
    if (!acc[dept]) {
      acc[dept] = [];
    }
    acc[dept].push(employee);
    return acc;
  }, {} as Record<string, LateEmployee[]>);

  // Generate PDF Report
  const generatePDFReport = () => {
    try {
      const doc = new jsPDF();
      
      // Header
      doc.setFontSize(20);
      doc.setTextColor(220, 38, 38); // Red color for late report
      doc.text('Late Employees Report', 20, 20);
      
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(`Date: ${format(selectedDate, 'PPP')}`, 20, 30);
      doc.text(`Generated on: ${format(new Date(), 'PPP pp')}`, 20, 38);
      
      let yPosition = 50;

      // Summary
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Summary', 20, yPosition);
      yPosition += 8;
      
      doc.setFontSize(10);
      doc.text(`Total Late Employees: ${filteredEmployees.length}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Departments Affected: ${Object.keys(employeesByDepartment).length}`, 20, yPosition);
      yPosition += 15;

      // Department-wise breakdown
      Object.entries(employeesByDepartment).forEach(([department, employees]) => {
        // Check if we need a new page
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        // Department header
        doc.setFontSize(12);
        doc.setTextColor(220, 38, 38);
        doc.text(`${department} Department (${employees.length} late)`, 20, yPosition);
        yPosition += 10;

        // Table data for this department
        const tableData = employees.map(emp => [
          emp.employee_name,
          emp.position,
          format(new Date(emp.first_check_in!), 'HH:mm'),
          emp.late_duration
        ]);

        // Create table
        (doc as any).autoTable({
          head: [['Employee Name', 'Position', 'Check-in', 'Late By']],
          body: tableData,
          startY: yPosition,
          theme: 'grid',
          headStyles: { 
            fillColor: [220, 38, 38], 
            textColor: 255,
            fontSize: 9
          },
          bodyStyles: { 
            fontSize: 8,
            fillColor: [255, 245, 245] // Light red background
          },
          alternateRowStyles: { 
            fillColor: [255, 255, 255] 
          },
          columnStyles: {
            0: { cellWidth: 50 },
            1: { cellWidth: 40 },
            2: { cellWidth: 30 },
            3: { cellWidth: 30 }
          },
          margin: { left: 20, right: 20 }
        });

        yPosition = (doc as any).lastAutoTable.finalY + 15;
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Page ${i} of ${pageCount} | Dutch Trails Late Report | ${format(new Date(), 'PPP')}`,
          20,
          285
        );
      }

      // Save the PDF
      const fileName = `late_employees_report_${format(selectedDate, 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Late employees PDF report generated successfully"
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate PDF report"
      });
    }
  };

  // Generate Excel Report
  const generateExcelReport = () => {
    try {
      const workbook = XLSX.utils.book_new();
      
      // Summary sheet
      const summaryData = [
        ['Late Employees Report'],
        [`Date: ${format(selectedDate, 'PPP')}`],
        [`Generated on: ${format(new Date(), 'PPP pp')}`],
        [''],
        ['Summary'],
        ['Total Late Employees', filteredEmployees.length],
        ['Departments Affected', Object.keys(employeesByDepartment).length],
        ['']
      ];

      // Department breakdown
      Object.entries(employeesByDepartment).forEach(([department, employees]) => {
        summaryData.push([`${department} Department`, employees.length, 'late employees']);
      });

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Detailed data sheet
      const detailedData = [
        ['Employee Name', 'Department', 'Position', 'Date', 'Check-in Time', 'Late Duration']
      ];

      filteredEmployees.forEach(emp => {
        detailedData.push([
          emp.employee_name,
          emp.department,
          emp.position,
          emp.date,
          emp.first_check_in ? format(new Date(emp.first_check_in), 'HH:mm:ss') : '',
          emp.late_duration
        ]);
      });

      const detailedSheet = XLSX.utils.aoa_to_sheet(detailedData);
      XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Late Employees');

      // Department-wise sheets
      Object.entries(employeesByDepartment).forEach(([department, employees]) => {
        const deptData = [
          ['Employee Name', 'Position', 'Check-in Time', 'Late Duration']
        ];
        
        employees.forEach(emp => {
          deptData.push([
            emp.employee_name,
            emp.position,
            emp.first_check_in ? format(new Date(emp.first_check_in), 'HH:mm:ss') : '',
            emp.late_duration
          ]);
        });

        const deptSheet = XLSX.utils.aoa_to_sheet(deptData);
        const sanitizedDeptName = department.replace(/[^\w\s]/gi, '').substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, deptSheet, sanitizedDeptName);
      });

      // Save the Excel file
      const fileName = `late_employees_report_${format(selectedDate, 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      
      toast({
        title: "Success",
        description: "Late employees Excel report generated successfully"
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error generating Excel:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate Excel report"
      });
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-red-500" />
            Late Employees Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Date Picker */}
            <div className="flex-1">
              <Label>Select Date</Label>
              <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setShowCalendar(false);
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Department Filter */}
            <div className="flex-1">
              <Label>Department</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.name}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="flex-1">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employee..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => fetchLateEmployees(selectedDate)} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Fetch Data
                </>
              )}
            </Button>
            
            <Button 
              onClick={generatePDFReport} 
              disabled={filteredEmployees.length === 0}
              variant="destructive"
            >
              <FileText className="mr-2 h-4 w-4" />
              Export PDF
            </Button>
            
            <Button 
              onClick={generateExcelReport} 
              disabled={filteredEmployees.length === 0}
              variant="outline"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Export Excel
            </Button>

            <Button 
              onClick={() => setIsDialogOpen(true)} 
              disabled={filteredEmployees.length === 0}
              variant="secondary"
            >
              <Users className="mr-2 h-4 w-4" />
              View Details ({filteredEmployees.length})
            </Button>
          </div>

          {/* Summary */}
          {filteredEmployees.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{filteredEmployees.length}</div>
                <div className="text-sm text-muted-foreground">Late Employees</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{Object.keys(employeesByDepartment).length}</div>
                <div className="text-sm text-muted-foreground">Departments Affected</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {Math.round(filteredEmployees.reduce((sum, emp) => sum + emp.late_minutes, 0) / filteredEmployees.length)}
                </div>
                <div className="text-sm text-muted-foreground">Avg Late Minutes</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Late Employees Details - {format(selectedDate, 'PPP')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {Object.entries(employeesByDepartment).map(([department, employees]) => (
              <div key={department}>
                <h3 className="text-lg font-semibold mb-3 text-red-600">
                  {department} Department ({employees.length} late)
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee Name</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Check-in Time</TableHead>
                        <TableHead>Late Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((employee) => (
                        <TableRow key={employee.id}>
                          <TableCell className="font-medium">{employee.employee_name}</TableCell>
                          <TableCell>{employee.position}</TableCell>
                          <TableCell>
                            {employee.first_check_in ? format(new Date(employee.first_check_in), 'HH:mm:ss') : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">{employee.late_duration}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
