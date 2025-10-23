/*
  # Add QuickBooks Invoice Fields to Leads Table

  1. New Columns
    - `quickbooks_invoice_id` (text, nullable) - Stores the QuickBooks invoice ID
    - `quickbooks_invoice_number` (text, nullable) - Stores the QuickBooks invoice number/document number

  2. Purpose
    - Enable proper tracking of QuickBooks invoices created for leads
    - Support frontend display of invoice information
    - Allow proper invoice sending functionality

  3. Notes
    - These columns are nullable since not all leads will have QuickBooks invoices
    - Existing leads will have NULL values for these fields initially
*/

-- Add QuickBooks invoice ID column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'quickbooks_invoice_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN quickbooks_invoice_id text;
  END IF;
END $$;

-- Add QuickBooks invoice number column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'quickbooks_invoice_number'
  ) THEN
    ALTER TABLE leads ADD COLUMN quickbooks_invoice_number text;
  END IF;
END $$;