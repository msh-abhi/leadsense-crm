import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getTwilioCredentials() {
  console.log('Fetching Twilio credentials...');
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('twilio_account_sid, twilio_auth_token, twilio_phone_number')
    .eq('integration_name', 'twilio')
    .single();

  if (error) {
    console.error('Error fetching Twilio credentials:', error);
    throw new Error('Failed to fetch Twilio credentials');
  }

  if (!data.twilio_account_sid || !data.twilio_auth_token || !data.twilio_phone_number) {
    console.error('Incomplete Twilio credentials in database');
    throw new Error('Twilio credentials are not fully configured');
  }
  console.log('Successfully fetched Twilio credentials.');
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('send-sms function invoked.');
    const { to, message, leadId, type } = await req.json();
    console.log(`Received SMS request to: ${to}`);

    if (!to || !message) {
      console.error('Missing `to` or `message` in request body');
      return new Response(JSON.stringify({ success: false, error: 'Missing `to` or `message`' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { twilio_account_sid, twilio_auth_token, twilio_phone_number } = await getTwilioCredentials();

    const twilioApiUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilio_account_sid}/Messages.json`;

    const basicAuth = 'Basic ' + encode(`${twilio_account_sid}:${twilio_auth_token}`);

    const body = new URLSearchParams();
    body.append('To', to);
    body.append('From', twilio_phone_number);
    body.append('Body', message);

    console.log('Sending request to Twilio API...');
    const response = await fetch(twilioApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': basicAuth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    console.log(`Twilio API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twilio API error response:', errorText);
      let errorMessage = `Twilio API Error: ${response.status} ${response.statusText}`;
      try {
        const errorBody = JSON.parse(errorText);
        if (errorBody.message) {
          errorMessage = errorBody.message;
        }
      } catch (e) {
        // Not a JSON response, use the raw text
        errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    console.log('SMS sent successfully via Twilio.');

    if (type !== 'test' && leadId) {
      console.log(`Logging communication history for lead: ${leadId}`);
      await supabase.from('communication_history').insert({
        lead_id: leadId,
        communication_type: 'sms',
        direction: 'outbound',
        content: message,
        sent_at: new Date().toISOString(),
      });
      console.log('Communication history logged.');
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unhandled error in send-sms function:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
