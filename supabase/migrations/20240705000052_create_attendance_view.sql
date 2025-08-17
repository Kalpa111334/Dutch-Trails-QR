-- Drop the existing view first
DROP VIEW IF EXISTS attendance_display;

-- Create a view for properly formatted attendance display
CREATE OR REPLACE VIEW attendance_display AS
SELECT 
    a.id,
    a.date,
    e.name as employee_name,
    e.department_id,
    d.name as department_name,
    a.first_check_in_time,
    a.first_check_out_time,
    a.second_check_in_time,
    a.second_check_out_time,
    CASE 
        WHEN a.first_check_out_time IS NOT NULL AND a.second_check_in_time IS NOT NULL THEN
            EXTRACT(EPOCH FROM (a.second_check_in_time - a.first_check_out_time))/60
        ELSE NULL
    END as break_duration_minutes,
    CASE 
        WHEN a.second_check_out_time IS NOT NULL THEN
            EXTRACT(EPOCH FROM (
                (a.first_check_out_time - a.first_check_in_time) + 
                COALESCE(a.second_check_out_time - a.second_check_in_time, INTERVAL '0 minutes')
            ))/60
        WHEN a.first_check_out_time IS NOT NULL THEN
            EXTRACT(EPOCH FROM (a.first_check_out_time - a.first_check_in_time))/60
        ELSE NULL
    END as working_duration_minutes,
    a.status,
    CASE
        WHEN a.first_check_in_time IS NOT NULL AND r.start_time IS NOT NULL THEN
            GREATEST(0,
                EXTRACT(EPOCH FROM (
                    a.first_check_in_time - 
                    (DATE_TRUNC('day', a.first_check_in_time) + r.start_time::time)
                ))/60 - COALESCE(r.grace_period, 0)
            )
        ELSE 0
    END as minutes_late,
    CASE
        WHEN a.first_check_out_time IS NOT NULL AND r.end_time IS NOT NULL THEN
            GREATEST(0,
                EXTRACT(EPOCH FROM (
                    (DATE_TRUNC('day', a.first_check_out_time) + r.end_time::time) -
                    a.first_check_out_time
                ))/60 - COALESCE(r.early_departure_threshold, 0)
            )
        ELSE 0
    END as early_departure_minutes
FROM attendance a
JOIN employees e ON a.employee_id = e.id
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN rosters r ON a.roster_id = r.id
ORDER BY a.date DESC, a.first_check_in_time DESC; 