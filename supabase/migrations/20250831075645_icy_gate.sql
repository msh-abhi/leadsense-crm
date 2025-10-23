/*
  # Create Settings Tables

  1. New Tables
    - `company_settings`
      - `id` (uuid, primary key)
      - `company_name` (text)
      - `company_email` (text)
      - `company_phone` (text)
      - `timezone` (text)
      - `currency` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `user_profiles`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `first_name` (text)
      - `last_name` (text)
      - `email` (text)
      - `role` (text)
      - `bio` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `notification_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `email_notifications` (boolean)
      - `sms_notifications` (boolean)
      - `new_lead_alerts` (boolean)
      - `follow_up_reminders` (boolean)
      - `payment_notifications` (boolean)
      - `system_alerts` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Add policies for service role to manage company settings

  3. Triggers
    - Add triggers to automatically update `updated_at` columns
*/

-- Create update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create company_settings table
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text DEFAULT 'Forte Athletics',
  company_email text DEFAULT 'info@forteathletics.com',
  company_phone text DEFAULT '+1 (555) 123-4567',
  timezone text DEFAULT 'America/Los_Angeles',
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email text,
  role text DEFAULT 'User',
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Create notification_settings table
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT true,
  sms_notifications boolean DEFAULT false,
  new_lead_alerts boolean DEFAULT true,
  follow_up_reminders boolean DEFAULT true,
  payment_notifications boolean DEFAULT true,
  system_alerts boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Company settings policies (accessible to all authenticated users, manageable by service role)
CREATE POLICY "Authenticated users can read company settings"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage company settings"
  ON public.company_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update company settings"
  ON public.company_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- User profiles policies (users can only manage their own profile)
CREATE POLICY "Users can read their own profile"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage user profiles"
  ON public.user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Notification settings policies (users can only manage their own settings)
CREATE POLICY "Users can read their own notification settings"
  ON public.notification_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings"
  ON public.notification_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification settings"
  ON public.notification_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage notification settings"
  ON public.notification_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add triggers to update the updated_at columns
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default company settings if none exist
INSERT INTO public.company_settings (company_name, company_email, company_phone, timezone, currency)
SELECT 'Forte Athletics', 'info@forteathletics.com', '+1 (555) 123-4567', 'America/Los_Angeles', 'USD'
WHERE NOT EXISTS (SELECT 1 FROM public.company_settings);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON public.notification_settings(user_id);