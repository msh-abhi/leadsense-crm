/*
  # Create centralized logging system

  1. New Tables
    - `logs`
      - `id` (uuid, primary key)
      - `created_at` (timestamp)
      - `level` (text) - INFO, WARN, ERROR
      - `message` (text) - log message
      - `function_name` (text) - name of the function/component
      - `lead_id` (uuid) - optional lead reference
      - `error_details` (jsonb) - structured error data
      - `context` (jsonb) - additional context data

  2. Security
    - Enable RLS on `logs` table
    - Add policy for service role to insert logs
    - Add policy for authenticated users to read logs

  3. Indexes
    - Index on created_at for efficient time-based queries
    - Index on level for filtering by log level
    - Index on function_name for filtering by source
*/

CREATE TABLE IF NOT EXISTS public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  level text NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR', 'DEBUG')),
  message text NOT NULL,
  function_name text,
  lead_id uuid,
  error_details jsonb,
  context jsonb
);

-- Enable RLS
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Service role can insert logs"
  ON public.logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read logs"
  ON public.logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON public.logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON public.logs USING btree (level);
CREATE INDEX IF NOT EXISTS idx_logs_function_name ON public.logs USING btree (function_name);
CREATE INDEX IF NOT EXISTS idx_logs_lead_id ON public.logs USING btree (lead_id);