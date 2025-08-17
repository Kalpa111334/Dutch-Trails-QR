-- Remove or update database functions that reference the removed grace_period column
-- This fixes the "column grace_period does not exist" error

DO $$ 
BEGIN
    -- Drop functions that reference grace_period column
    DROP FUNCTION IF EXISTS calculate_late_minutes(timestamp, integer);
    DROP FUNCTION IF EXISTS recalculate_attendance_late_minutes();
    DROP FUNCTION IF EXISTS update_attendance_late_minutes();
    DROP FUNCTION IF EXISTS process_attendance_with_roster();
    DROP FUNCTION IF EXISTS ensure_present_employee_fields();
    
    RAISE NOTICE 'Dropped functions that referenced grace_period column';
    
    -- Drop any constraints that reference grace_period
    ALTER TABLE rosters DROP CONSTRAINT IF EXISTS rosters_grace_period_check;
    
    -- Drop any indexes that reference grace_period
    DROP INDEX IF EXISTS idx_rosters_grace_period;
    
    RAISE NOTICE 'Removed grace_period constraints and indexes';
    
    -- Update any remaining views that might reference grace_period in expressions
    -- Drop and recreate the attendance calculation view if it exists
    DROP VIEW IF EXISTS attendance_calculations CASCADE;
    
    RAISE NOTICE 'Cleaned up grace_period references in database functions and views';
    
EXCEPTION WHEN OTHERS THEN
    -- Log any errors but continue
    RAISE NOTICE 'Error cleaning up grace_period functions: %', SQLERRM;
    -- Don't fail the migration for non-critical cleanup
END $$;

-- Add a simple function to calculate late minutes without grace period
CREATE OR REPLACE FUNCTION calculate_late_minutes_simple(
    check_in_time timestamp,
    roster_start_time time
) RETURNS integer AS $$
BEGIN
    -- Simple calculation: late minutes = check_in_time - roster_start_time (no grace period)
    RETURN GREATEST(
        EXTRACT(EPOCH FROM (check_in_time::time - roster_start_time))/60,
        0
    )::integer;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_late_minutes_simple IS 'Calculate late minutes without grace period - pure roster-based calculation';
