-- Function to calculate late minutes based on roster start time
CREATE OR REPLACE FUNCTION calculate_roster_late_minutes(
    p_check_in_time TIMESTAMPTZ,
    p_roster_start_time TIME,
    p_grace_period INTEGER
) RETURNS INTEGER AS $$
BEGIN
    RETURN GREATEST(0,
        EXTRACT(EPOCH FROM (
            p_check_in_time - 
            (DATE_TRUNC('day', p_check_in_time) + p_roster_start_time::time)
        ))/60 - COALESCE(p_grace_period, 0)
    );
END;
$$ LANGUAGE plpgsql;

-- Recalculate late minutes for all attendance records
DO $$
DECLARE
    v_record RECORD;
BEGIN
    -- Loop through all attendance records with check-in times
    FOR v_record IN 
        SELECT 
            a.id,
            a.first_check_in_time,
            r.start_time,
            r.grace_period
        FROM attendance a
        JOIN rosters r ON a.roster_id = r.id
        WHERE a.first_check_in_time IS NOT NULL
    LOOP
        -- Update late minutes using roster-based calculation
        UPDATE attendance
        SET 
            minutes_late = calculate_roster_late_minutes(
                v_record.first_check_in_time,
                v_record.start_time,
                v_record.grace_period
            ),
            updated_at = NOW()
        WHERE id = v_record.id;
    END LOOP;
END;
$$;

-- Drop the temporary function
DROP FUNCTION IF EXISTS calculate_roster_late_minutes; 