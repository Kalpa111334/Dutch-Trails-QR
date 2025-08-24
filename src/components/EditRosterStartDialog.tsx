import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';

interface EditRosterStartDialogProps {
  isOpen: boolean;
  onClose: () => void;
  record: any;
  onUpdate: () => void;
}

export function EditRosterStartDialog({ isOpen, onClose, record, onUpdate }: EditRosterStartDialogProps) {
  const [rosterStart, setRosterStart] = useState(record.roster?.start_time || '09:00');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      setLoading(true);

      // Update roster start time
      const { error: rosterError } = await supabase
        .from('rosters')
        .update({ start_time: rosterStart })
        .eq('id', record.roster?.id);

      if (rosterError) throw rosterError;

      // Recalculate late duration based on new roster start time
      const checkInTime = new Date(record.first_check_in_time);
      const [hours, minutes] = rosterStart.split(':').map(Number);
      const rosterStartDate = new Date(checkInTime);
      rosterStartDate.setHours(hours, minutes, 0, 0);

      const lateMinutes = Math.max(0, 
        (checkInTime.getTime() - rosterStartDate.getTime()) / (1000 * 60)
      );

      // Update attendance record with new late duration
      const { error: attendanceError } = await supabase
        .from('attendance')
        .update({ minutes_late: lateMinutes })
        .eq('id', record.id);

      if (attendanceError) throw attendanceError;

      toast({
        title: 'Success',
        description: 'Roster start time updated successfully',
      });

      onUpdate();
      onClose();
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Roster Start Time</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Employee</Label>
            <Input disabled value={record.employee_name || 'Unknown'} />
          </div>
          <div className="space-y-2">
            <Label>Current Start Time</Label>
            <Input
              type="time"
              value={rosterStart}
              onChange={(e) => setRosterStart(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
