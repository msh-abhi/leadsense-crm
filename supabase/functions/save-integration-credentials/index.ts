import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

interface SaveCredentialsRequest {
  action: 'save' | 'get';
  integration_name: string;
  // QuickBooks fields
  client_id?: string;
  client_secret?: string;
  redirect_url?: string;
  // Twilio fields
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_phone_number?: string;
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    console.log(`Processing ${action} request for integration:`, body.integration_name);

    if (action === 'save') {
      return await handleSaveCredentials(body);
    } else if (action === 'get') {
      return await handleGetCredentials(body);
    } else {
      throw new Error(`Unknown action: ${action}`);
    }
  } catch (error: any) {
    console.error('Error in save-integration-credentials function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

async function handleSaveCredentials(body: SaveCredentialsRequest): Promise<Response> {
  const { 
    integration_name, 
    client_id, 
    client_secret, 
    redirect_url,
    twilio_account_sid,
    twilio_auth_token,
    twilio_phone_number
  } = body;

  console.log('Received save request for integration:', integration_name);
  console.log('Request fields:', {
    integration_name,
    has_client_id: !!client_id,
    has_client_secret: !!client_secret,
    has_redirect_url: !!redirect_url,
    has_twilio_account_sid: !!twilio_account_sid,
    has_twilio_auth_token: !!twilio_auth_token,
    has_twilio_phone_number: !!twilio_phone_number
  });

  // Validate integration_name
  const allowedIntegrations = ['quickbooks', 'twilio'];
  if (!allowedIntegrations.includes(integration_name.toLowerCase())) {
    throw new Error(`Invalid integration name. Allowed: ${allowedIntegrations.join(', ')}`);
  }

  let credentialsData: any = {
    integration_name: integration_name.toLowerCase(),
    updated_at: new Date().toISOString()
  };

  if (integration_name.toLowerCase() === 'quickbooks') {
    // Validate QuickBooks required fields
    if (!client_id || !client_secret || !redirect_url) {
      throw new Error('Missing required QuickBooks fields: client_id, client_secret, redirect_url');
    }

    // Validate redirect_url format
    try {
      new URL(redirect_url);
    } catch {
      throw new Error('Invalid redirect_url format. Must be a valid URL.');
    }

    credentialsData = {
      ...credentialsData,
      client_id: client_id.trim(),
      client_secret: client_secret.trim(),
      redirect_url: redirect_url.trim(),
      // Set Twilio fields to null for QuickBooks
      twilio_account_sid: null,
      twilio_auth_token: null,
      twilio_phone_number: null
    };

  } else if (integration_name.toLowerCase() === 'twilio') {
    // Validate Twilio required fields
    if (!twilio_account_sid || !twilio_auth_token || !twilio_phone_number) {
      throw new Error('Missing required Twilio fields: twilio_account_sid, twilio_auth_token, twilio_phone_number');
    }

    // Validate Twilio Account SID format (should start with AC)
    if (!twilio_account_sid.startsWith('AC')) {
      throw new Error('Invalid Twilio Account SID format. Should start with "AC"');
    }

    // Validate phone number format (should start with +)
    if (!twilio_phone_number.startsWith('+')) {
      throw new Error('Invalid Twilio phone number format. Should start with "+" and include country code');
    }

    credentialsData = {
      ...credentialsData,
      // Set QuickBooks fields to empty strings to satisfy NOT NULL constraints
      client_id: 'N/A',
      client_secret: 'N/A', 
      redirect_url: 'N/A',
      // Set Twilio-specific fields
      twilio_account_sid: twilio_account_sid.trim(),
      twilio_auth_token: twilio_auth_token.trim(),
      twilio_phone_number: twilio_phone_number.trim()
    };
  }

  console.log('Prepared credentials data:', {
    integration_name: credentialsData.integration_name,
    has_client_id: !!credentialsData.client_id,
    has_client_secret: !!credentialsData.client_secret,
    has_redirect_url: !!credentialsData.redirect_url,
    has_twilio_account_sid: !!credentialsData.twilio_account_sid,
    has_twilio_auth_token: !!credentialsData.twilio_auth_token,
    has_twilio_phone_number: !!credentialsData.twilio_phone_number
  });

  // Upsert credentials (insert or update if exists)
  const { data, error } = await supabase
    .from('integration_credentials')
    .upsert(credentialsData, {
      onConflict: 'integration_name'
    })
    .select('id, integration_name, created_at, updated_at')
    .single();

  if (error) {
    console.error('Error saving integration credentials:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    throw new Error(`Failed to save credentials: ${error.message}`);
  }

  console.log(`Credentials saved successfully for ${integration_name}`);

  return new Response(JSON.stringify({
    success: true,
    integration_name: data.integration_name,
    message: `${integration_name} credentials saved successfully`,
    metadata: {
      id: data.id,
      created_at: data.created_at,
      updated_at: data.updated_at
    }
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleGetCredentials(body: SaveCredentialsRequest): Promise<Response> {
  const { integration_name } = body;

  if (!integration_name) {
    throw new Error('Missing integration_name parameter');
  }

  console.log(`Fetching credentials for integration: ${integration_name}`);

  const { data, error } = await supabase
    .from('integration_credentials')
    .select('*')
    .eq('integration_name', integration_name.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('Error fetching integration credentials:', error);
    throw new Error(`Failed to fetch credentials: ${error.message}`);
  }

  if (!data) {
    return new Response(JSON.stringify({
      success: false,
      error: 'No credentials found for this integration',
      integration_name
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Return appropriate fields based on integration type
  let responseData: any = {
    success: true,
    integration_name: data.integration_name,
    created_at: data.created_at,
    updated_at: data.updated_at
  };

  if (integration_name.toLowerCase() === 'quickbooks') {
    responseData = {
      ...responseData,
      client_id: data.client_id,
      redirect_url: data.redirect_url
      // client_secret is intentionally omitted for security
    };
  } else if (integration_name.toLowerCase() === 'twilio') {
    responseData = {
      ...responseData,
      twilio_account_sid: data.twilio_account_sid,
      twilio_phone_number: data.twilio_phone_number
      // twilio_auth_token is intentionally omitted for security
    };
  }

  console.log('Returning credentials data:', {
    integration_name: responseData.integration_name,
    has_client_id: !!responseData.client_id,
    has_twilio_account_sid: !!responseData.twilio_account_sid
  });

  return new Response(JSON.stringify(responseData), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(serve_handler);