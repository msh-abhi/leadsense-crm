/*
  # Create AI Settings Configuration Table

  1. New Tables
    - `ai_settings`
      - `id` (uuid, primary key)
      - `enabled` (boolean, master kill switch)
      - `primary_model_provider` (text, selected primary AI model)
      - `fallback_openai_enabled` (boolean, enable OpenAI fallback)
      - `fallback_deepseek_claude_enabled` (boolean, enable DeepSeek/Claude fallback)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `ai_settings` table
    - Add policy for service role to manage settings
    - Add policy for authenticated users to read settings

  3. Default Configuration
    - Insert default settings with AI enabled and GEMINI as primary model
*/

-- Create the ai_settings table
CREATE TABLE IF NOT EXISTS public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled boolean NOT NULL DEFAULT true, -- Master Kill Switch
  primary_model_provider text NOT NULL DEFAULT 'GEMINI', -- 'GEMINI', 'OPENAI', 'DEEPSEEK', 'CLAUDE'
  fallback_openai_enabled boolean NOT NULL DEFAULT false,
  fallback_deepseek_claude_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Policy for service role to manage ai_settings (full access)
CREATE POLICY "Service role can manage ai_settings"
  ON public.ai_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy for authenticated users to read ai_settings
CREATE POLICY "Authenticated users can read ai_settings"
  ON public.ai_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy for authenticated users to update ai_settings
CREATE POLICY "Authenticated users can update ai_settings"
  ON public.ai_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add trigger to update the updated_at column
CREATE TRIGGER update_ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure valid primary model providers
ALTER TABLE public.ai_settings 
ADD CONSTRAINT ai_settings_primary_model_provider_check 
CHECK (primary_model_provider IN ('GEMINI', 'OPENAI', 'DEEPSEEK', 'CLAUDE'));

-- Insert a default row if the table is empty
INSERT INTO public.ai_settings (enabled, primary_model_provider, fallback_openai_enabled, fallback_deepseek_claude_enabled)
SELECT true, 'GEMINI', false, false
WHERE NOT EXISTS (SELECT 1 FROM public.ai_settings);