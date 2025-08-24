-- Update rosters for Corporate Office department
UPDATE rosters
SET start_time = '08:30:00',
    end_time = '17:30:00',
    shift_pattern = CASE 
        WHEN shift_pattern IS NULL 
             OR jsonb_typeof(shift_pattern) <> 'array' 
             OR jsonb_array_length(shift_pattern) = 0 
             OR jsonb_typeof(shift_pattern->0) <> 'object'
        THEN '[{"time_slot": {"start_time": "08:30", "end_time": "17:30"}}]'::jsonb
        ELSE jsonb_set(
          shift_pattern,
          '{0,time_slot}',
          '{"start_time": "08:30", "end_time": "17:30"}'::jsonb,
          true
        )
      END
WHERE department_id IN (
  SELECT id::text FROM departments WHERE name = 'Corporate Office'
);

-- Update rosters for IT department
UPDATE rosters
SET start_time = '09:00:00',
    end_time = '18:00:00',
    shift_pattern = CASE 
        WHEN shift_pattern IS NULL 
             OR jsonb_typeof(shift_pattern) <> 'array' 
             OR jsonb_array_length(shift_pattern) = 0 
             OR jsonb_typeof(shift_pattern->0) <> 'object'
        THEN '[{"time_slot": {"start_time": "09:00", "end_time": "18:00"}}]'::jsonb
        ELSE jsonb_set(
          shift_pattern,
          '{0,time_slot}',
          '{"start_time": "09:00", "end_time": "18:00"}'::jsonb,
          true
        )
      END
WHERE department_id IN (
  SELECT id::text FROM departments WHERE name = 'IT'
);

-- Update rosters for Purchasing & Stores department
UPDATE rosters
SET start_time = '08:30:00',
    end_time = '17:30:00',
    shift_pattern = CASE 
        WHEN shift_pattern IS NULL 
             OR jsonb_typeof(shift_pattern) <> 'array' 
             OR jsonb_array_length(shift_pattern) = 0 
             OR jsonb_typeof(shift_pattern->0) <> 'object'
        THEN '[{"time_slot": {"start_time": "08:30", "end_time": "17:30"}}]'::jsonb
        ELSE jsonb_set(
          shift_pattern,
          '{0,time_slot}',
          '{"start_time": "08:30", "end_time": "17:30"}'::jsonb,
          true
        )
      END
WHERE department_id IN (
  SELECT id::text FROM departments WHERE name = 'Purchasing & Stores'
);

-- Update the default time slots for new rosters
CREATE OR REPLACE FUNCTION get_department_time_slot(department_name TEXT)
RETURNS JSONB AS $$
BEGIN
  RETURN CASE department_name
    WHEN 'Corporate Office' THEN '{"start_time": "08:30", "end_time": "17:30"}'::jsonb
    WHEN 'IT' THEN '{"start_time": "09:00", "end_time": "18:00"}'::jsonb
    WHEN 'Purchasing & Stores' THEN '{"start_time": "08:30", "end_time": "17:30"}'::jsonb
    ELSE '{"start_time": "09:00", "end_time": "17:00"}'::jsonb -- Default
  END;
END;
$$ LANGUAGE plpgsql;
