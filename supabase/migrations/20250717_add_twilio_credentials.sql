ALTER TABLE public.integration_credentials
ADD COLUMN twilio_account_sid TEXT,
ADD COLUMN twilio_auth_token TEXT,
ADD COLUMN twilio_phone_number TEXT;

COMMENT ON COLUMN public.integration_credentials.twilio_account_sid IS 'Twilio Account SID for SMS integration';
COMMENT ON COLUMN public.integration_credentials.twilio_auth_token IS 'Twilio Auth Token for SMS integration';
COMMENT ON COLUMN public.integration_credentials.twilio_phone_number IS 'Twilio phone number for sending SMS';