-- Quick fix script to apply the grace_period column fix
-- Run this script to fix the missing grace_period column issue

\echo 'Applying grace_period column fix...'

-- Apply the migration
\i supabase/migrations/20250816201237_fix_missing_grace_period_column.sql

\echo 'Grace period fix completed!'
\echo 'Verifying rosters table structure...'

-- Show the rosters table structure to verify
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'rosters' 
AND table_schema = 'public'
ORDER BY ordinal_position;

\echo 'Showing sample roster data with grace_period...'

-- Show some sample data to verify
SELECT id, name, grace_period, start_time, end_time 
FROM rosters 
LIMIT 5;