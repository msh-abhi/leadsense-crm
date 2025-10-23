/*
  # Update early_bird_deadline column type

  1. Schema Changes
    - Change `early_bird_deadline` column from text to timestamp with time zone
    - This enables proper date calculations for dynamic early bird discounts

  2. Data Migration
    - Existing text values will be converted where possible
    - Invalid dates will be set to NULL

  3. Benefits
    - Enables accurate date arithmetic
    - Supports timezone-aware calculations
    - Improves data consistency
*/

-- First, try to convert existing text values to timestamps where possible
UPDATE leads 
SET early_bird_deadline = CASE 
  WHEN early_bird_deadline IS NOT NULL 
    AND early_bird_deadline != '' 
    AND early_bird_deadline ~ '^\d{4}-\d{2}-\d{2}' 
  THEN early_bird_deadline::timestamp with time zone
  ELSE NULL
END
WHERE early_bird_deadline IS NOT NULL;

-- Change the column type
ALTER TABLE leads 
ALTER COLUMN early_bird_deadline TYPE timestamp with time zone 
USING CASE 
  WHEN early_bird_deadline IS NOT NULL 
    AND early_bird_deadline != '' 
    AND early_bird_deadline ~ '^\d{4}-\d{2}-\d{2}' 
  THEN early_bird_deadline::timestamp with time zone
  ELSE NULL
END;