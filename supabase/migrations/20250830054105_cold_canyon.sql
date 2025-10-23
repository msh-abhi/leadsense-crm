/*
  # Add QuickBooks Payment Link to Leads Table

  1. Schema Changes
    - Add `quickbooks_payment_link` column to `leads` table
    - Column is nullable text type to store the shareable payment URL from QuickBooks

  2. Purpose
    - Store QuickBooks Online payment links for each invoice
    - Enable custom email sending with payment links
    - Provide visibility of payment links in CRM interface

  3. Notes
    - This is a non-breaking change (nullable column)
    - Existing leads will have NULL values initially
    - New invoices will populate this field automatically
*/

-- Add the payment link column to the leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS quickbooks_payment_link text;

-- Add an index for performance when querying by payment link
CREATE INDEX IF NOT EXISTS idx_leads_quickbooks_payment_link 
ON public.leads (quickbooks_payment_link) 
WHERE quickbooks_payment_link IS NOT NULL;