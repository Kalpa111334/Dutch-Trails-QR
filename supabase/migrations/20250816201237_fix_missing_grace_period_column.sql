-- Fix missing grace_period column in rosters table
-- This migration ensures the grace_period column exists and has proper constraints

DO $$ 
BEGIN 
    -- Check if grace_period column exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'grace_period'
        AND table_schema = 'public'
    ) THEN
        -- Add grace_period column with default value
        ALTER TABLE public.rosters 
        ADD COLUMN grace_period INTEGER NOT NULL DEFAULT 15;
        
        RAISE NOTICE 'Added grace_period column to rosters table';
    ELSE
        RAISE NOTICE 'grace_period column already exists in rosters table';
    END IF;
    
    -- Ensure check constraint exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_name = 'rosters' 
        AND tc.constraint_name = 'rosters_grace_period_check'
        AND tc.table_schema = 'public'
    ) THEN
        -- Add check constraint to ensure grace_period is non-negative
        ALTER TABLE public.rosters 
        ADD CONSTRAINT rosters_grace_period_check 
        CHECK (grace_period >= 0);
        
        RAISE NOTICE 'Added grace_period check constraint';
    ELSE
        RAISE NOTICE 'grace_period check constraint already exists';
    END IF;
    
    -- Add comment for documentation
    COMMENT ON COLUMN public.rosters.grace_period IS 'Grace period in minutes for late check-ins (default: 15 minutes)';
    
    -- Update any existing rosters that might have NULL grace_period values
    UPDATE public.rosters 
    SET grace_period = 15 
    WHERE grace_period IS NULL;
    
EXCEPTION 
    WHEN OTHERS THEN 
        RAISE EXCEPTION 'Failed to add grace_period column: %', SQLERRM;
END $$;

-- Verify the column was added successfully
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rosters' 
        AND column_name = 'grace_period'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE 'SUCCESS: grace_period column is now present in rosters table';
    ELSE
        RAISE EXCEPTION 'FAILED: grace_period column is still missing from rosters table';
    END IF;
END $$;