-- Remove hardcoded default times and grace period from rosters table
-- This migration removes the 9:00-17:00 default times and grace period defaults
-- Forces each employee to have their own specific roster start/end times

DO $$ 
BEGIN
    -- Check if grace_period column exists and remove it along with dependent views
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'rosters' AND column_name = 'grace_period') THEN
        
            -- Drop all dependent objects that might reference grace_period
    DROP VIEW IF EXISTS attendance_display CASCADE;
    DROP VIEW IF EXISTS employee_attendance_status CASCADE;
    DROP VIEW IF EXISTS attendance_calculations CASCADE;
    DROP VIEW IF EXISTS roster_attendance_view CASCADE;
    
    -- Drop any functions that might reference grace_period
    DROP FUNCTION IF EXISTS calculate_late_minutes(timestamp, integer) CASCADE;
    DROP FUNCTION IF EXISTS process_roster_attendance(uuid, timestamp, uuid) CASCADE;
    DROP FUNCTION IF EXISTS handle_selective_deletion(uuid, text) CASCADE;
    DROP FUNCTION IF EXISTS recalculate_attendance_late_minutes() CASCADE;
    DROP FUNCTION IF EXISTS ensure_present_employee_fields() CASCADE;
    
    RAISE NOTICE 'Dropped dependent views and functions that reference grace_period';
        
        -- Now drop the grace_period column
        ALTER TABLE rosters DROP COLUMN grace_period;
        RAISE NOTICE 'Removed grace_period column from rosters table';
        
        -- Recreate the views without grace_period references
        -- attendance_display view (without grace_period)
        CREATE OR REPLACE VIEW attendance_display AS
        SELECT 
            a.id,
            a.employee_id,
            a.date,
            a.first_check_in_time,
            a.first_check_out_time,
            a.second_check_in_time,
            a.second_check_out_time,
            a.status,
            a.working_duration_minutes,
            a.minutes_late,
            e.name as employee_name,
            d.name as department_name,
            r.start_time as roster_start_time,
            r.end_time as roster_end_time
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN rosters r ON a.employee_id = r.employee_id 
            AND a.date >= r.start_date 
            AND a.date <= r.end_date 
            AND r.is_active = true;
        
        -- employee_attendance_status view (without grace_period)
        CREATE OR REPLACE VIEW employee_attendance_status AS
        SELECT 
            e.id as employee_id,
            e.name as employee_name,
            d.name as department_name,
            r.start_time as roster_start_time,
            r.end_time as roster_end_time,
            COALESCE(a.status, 'ABSENT') as status,
            a.first_check_in_time,
            a.minutes_late
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN rosters r ON e.id = r.employee_id 
            AND r.is_active = true
            AND CURRENT_DATE >= r.start_date 
            AND CURRENT_DATE <= r.end_date
        LEFT JOIN attendance a ON e.id = a.employee_id 
            AND a.date = CURRENT_DATE
        WHERE e.status = 'active';
        
        RAISE NOTICE 'Recreated views without grace_period references';
    END IF;
    
    -- Remove default values for start_time and end_time
    -- These should be explicitly set per employee roster, not hardcoded to 9:00-17:00
    ALTER TABLE rosters 
    ALTER COLUMN start_time DROP DEFAULT,
    ALTER COLUMN end_time DROP DEFAULT;
    
    -- Remove hardcoded break time defaults as well
    ALTER TABLE rosters 
    ALTER COLUMN break_start DROP DEFAULT,
    ALTER COLUMN break_end DROP DEFAULT;
    
    -- Update any existing records that might be using the old default times
    -- Note: This is commented out to preserve existing data, but you can uncomment if needed
    /*
    UPDATE rosters 
    SET start_time = '08:00:00', end_time = '16:00:00' 
    WHERE start_time = '09:00:00' AND end_time = '17:00:00';
    */
    
    -- Log the changes
    RAISE NOTICE 'Successfully removed hardcoded default times (9:00-17:00) from rosters table';
    RAISE NOTICE 'All employee rosters must now have explicit start/end times set individually';
    
EXCEPTION WHEN OTHERS THEN
    -- Log any errors but don't fail the migration
    RAISE NOTICE 'Error removing defaults: %', SQLERRM;
    RAISE;
END $$;

-- Add a comment to the table explaining the change
COMMENT ON TABLE rosters IS 'Employee rosters with individual start/end times. No hardcoded defaults - each roster must specify explicit times per employee.';
COMMENT ON COLUMN rosters.start_time IS 'Employee-specific start time - must be explicitly set, no default 9:00 AM';
COMMENT ON COLUMN rosters.end_time IS 'Employee-specific end time - must be explicitly set, no default 5:00 PM';
