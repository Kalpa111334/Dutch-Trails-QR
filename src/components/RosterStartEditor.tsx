import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface RosterStartEditorProps {
  record: any;
  onUpdate: () => void;
}

export function RosterStartEditor({ record, onUpdate }: RosterStartEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [rosterStart, setRosterStart] = useState(record.roster?.start_time || '09:00');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      setLoading(true);

      // First check if a roster exists for this employee and date
      const { data: existingRosters, error: fetchError } = await supabase
        .from('rosters')
        .select('*')
        .eq('employee_id', record.employee_id)
        .lte('start_date', record.date)
        .gte('end_date', record.date)
        .eq('is_active', true);

      if (fetchError) throw fetchError;

      let rosterId = record.roster?.id;

      if (existingRosters && existingRosters.length > 0) {
        // Update the existing active roster
        const existingRoster = existingRosters[0];
        rosterId = existingRoster.id;

        // Check if the start time actually needs to be updated
        if (existingRoster.start_time !== rosterStart) {
          const { error: updateError } = await supabase
            .from('rosters')
            .update({
              start_time: rosterStart,
              updated_at: new Date().toISOString()
            })
            .eq('id', rosterId)
            .select()
            .single();

          if (updateError) {
            console.error('Roster update error:', updateError);
            throw new Error('Failed to update roster start time');
          }
        }
      } else {
        // Create a new roster if none exists
        const { data: newRoster, error: createError } = await supabase
          .from('rosters')
          .insert({
            employee_id: record.employee_id,
            department_id: record.employee?.department_id,
            start_time: rosterStart,
            end_time: '17:30', // Default end time
            break_duration: 60, // Default break duration
            start_date: record.date,
            end_date: record.date,
            is_active: true,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) throw createError;
        rosterId = newRoster.id;
      }

      try {
        // Update the attendance record with the roster ID if needed
        if (record.roster_id !== rosterId) {
          const { error: updateAttendanceError } = await supabase
            .from('attendance')
            .update({ roster_id: rosterId })
            .eq('id', record.id)
            .select()
            .single();

          if (updateAttendanceError) {
            console.error('Attendance update error:', updateAttendanceError);
            throw new Error('Failed to update attendance record with new roster');
          }
        }

        // Recalculate late duration based on new roster start time
        if (record.first_check_in_time) {
          const checkInTime = new Date(record.first_check_in_time);
          const [hours, minutes] = rosterStart.split(':').map(Number);
          const rosterStartDate = new Date(checkInTime);
          rosterStartDate.setHours(hours, minutes, 0, 0);

          const lateMinutes = Math.max(0, 
            Math.round((checkInTime.getTime() - rosterStartDate.getTime()) / (1000 * 60))
          );

          // Update attendance record with new late duration
          const { error: attendanceError } = await supabase
            .from('attendance')
            .update({ 
              minutes_late: lateMinutes,
              updated_at: new Date().toISOString()
            })
            .eq('id', record.id)
            .select()
            .single();

          if (attendanceError) {
            console.error('Late minutes update error:', attendanceError);
            throw new Error('Failed to update late duration');
          }
        }
      } catch (error) {
        console.error('Error updating attendance record:', error);
        throw new Error('Failed to update attendance record');
      }

      toast({
        title: 'Success',
        description: 'Roster start time updated successfully',
      });

      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Error updating roster start time:', error);
      toast({
        title: 'Error',
        description: 'Failed to update roster start time',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="flex items-center justify-center gap-2">
        <span>{record.roster?.start_time || '09:00'}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(true)}
          className="h-6 w-6 p-0"
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <Input
        type="time"
        value={rosterStart}
        onChange={(e) => setRosterStart(e.target.value)}
        className="w-24 h-8 text-xs"
      />
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSave}
          disabled={loading}
          className="h-6 w-6 p-0"
        >
          <Save className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setRosterStart(record.roster?.start_time || '09:00');
            setIsEditing(false);
          }}
          disabled={loading}
          className="h-6 w-6 p-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}