/*
  # Create integration_credentials table

  1. New Tables
    - `integration_credentials`
      - `id` (uuid, primary key)
      - `integration_name` (text, unique, not null) - e.g., 'quickbooks'
      - `client_id` (text, not null) - OAuth client ID
      - `client_secret` (text, not null) - OAuth client secret
      - `redirect_url` (text, not null) - OAuth redirect URL
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `integration_credentials` table
    - Add policy for service role to manage credentials
    - Restrict access to prevent exposure of sensitive data

  3. Triggers
    - Add trigger to automatically update `updated_at` column
*/

-- Create the integration_credentials table
CREATE TABLE IF NOT EXISTS integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name text UNIQUE NOT NULL,
  client_id text NOT NULL,
  client_secret text NOT NULL,
  redirect_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access only (maximum security)
CREATE POLICY "Service role can manage integration credentials"
  ON integration_credentials
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add trigger to update the updated_at column
CREATE TRIGGER update_integration_credentials_updated_at
  BEFORE UPDATE ON integration_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create index for faster lookups by integration name
CREATE INDEX IF NOT EXISTS idx_integration_credentials_name 
  ON integration_credentials(integration_name);