import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface OAuthRequest {
  action: 'initiate' | 'callback';
  code?: string;
  realmId?: string;
  state?: string;
}

async function getQuickBooksCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
}> {
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('client_id, client_secret, redirect_url')
    .eq('integration_name', 'quickbooks')
    .single();

  if (error || !data) {
    throw new Error('QuickBooks credentials not configured. Please set up credentials in the Integration Hub first.');
  }

  return {
    clientId: data.client_id,
    clientSecret: data.client_secret,
    redirectUrl: data.redirect_url
  };
}

const serve_handler = async (req: Request): Promise<Response> => {
  console.log('--- QUICKBOOKS OAUTH FUNCTION INVOKED ---');
  console.log('Request method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let action: string;
    let code: string | undefined;
    let realmId: string | undefined;
    let state: string | undefined;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      code = url.searchParams.get('code') || undefined;
      realmId = url.searchParams.get('realmId') || undefined;
      state = url.searchParams.get('state') || undefined;

      console.log('GET request parameters:', { code: !!code, realmId, state });

      // If we have code and realmId, this is the OAuth callback
      if (code && realmId) {
        action = 'callback';
        console.log('Detected OAuth callback from QuickBooks');
      } else {
        action = 'initiate';
        console.log('Detected initiate request');
      }
    } else {
      const body = await req.json();
      action = body.action;
      code = body.code;
      realmId = body.realmId;
      state = body.state;
      console.log('POST request body action:', action);
    }

    console.log('Extracted parameters:', { code: !!code, realmId, state });
    console.log('Parsed action:', action);

    if (action === 'initiate') {
      console.log('=== INITIATE ACTION STARTED ===');
      const credentials = await getQuickBooksCredentials();
      const authUrl = generateQuickBooksAuthUrl(credentials.clientId, credentials.redirectUrl);
      
      console.log('Generated auth URL:', authUrl);
      
      return new Response(JSON.stringify({
        success: true,
        authUrl
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'callback') {
      console.log('=== CALLBACK ACTION STARTED ===');
      console.log('Received callback parameters:', { code: !!code, realmId, state });
      
      if (!code || !realmId) {
        console.error('Missing required callback parameters:', { code: !!code, realmId, state });
        throw new Error('Missing code or realmId in callback');
      }
      
      console.log('Getting QuickBooks credentials...');
      const credentials = await getQuickBooksCredentials();
      console.log('Credentials retrieved successfully');
      
      console.log('Exchanging code for tokens...');
      const tokenData = await exchangeCodeForTokens(code, realmId, credentials.clientId, credentials.clientSecret, credentials.redirectUrl);
      console.log('Token exchange successful:', {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        refreshTokenExpiresIn: tokenData.x_refresh_token_expires_in
      });
      
      // Store tokens securely
      console.log('Preparing to save tokens to database...');
      const tokenRecord = {
        realm_id: realmId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
        x_refresh_token_expires_at: tokenData.x_refresh_token_expires_in 
          ? new Date(Date.now() + (tokenData.x_refresh_token_expires_in * 1000)).toISOString()
          : null,
        updated_at: new Date().toISOString()
      };
      
      console.log('Token record to save:', {
        realm_id: tokenRecord.realm_id,
        hasAccessToken: !!tokenRecord.access_token,
        hasRefreshToken: !!tokenRecord.refresh_token,
        expires_at: tokenRecord.expires_at,
        x_refresh_token_expires_at: tokenRecord.x_refresh_token_expires_at
      });
      
      const { data: savedToken, error: saveError } = await supabase
        .from('quickbooks_tokens')
        .upsert(tokenRecord, {
          onConflict: 'realm_id'
        })
        .select()
        .single();

      if (saveError) {
        console.error('=== ERROR SAVING TOKENS ===');
        console.error('Save error details:', JSON.stringify(saveError, null, 2));
        console.error('Error message:', saveError.message);
        console.error('Error code:', saveError.code);
        console.error('Error hint:', saveError.hint);
        throw new Error(`Failed to save QuickBooks tokens: ${saveError.message}`);
      }

      console.log('=== TOKENS SAVED SUCCESSFULLY ===');
      console.log('Saved token data:', {
        id: savedToken?.id,
        realm_id: savedToken?.realm_id,
        created_at: savedToken?.created_at
      });
      
      // Return a simple HTML page that closes the window and notifies the parent
      const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>QuickBooks Connected</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: #28a745; font-size: 24px; margin-bottom: 20px; }
            .message { color: #666; margin-bottom: 30px; }
          </style>
        </head>
        <body>
          <div class="success">✅ QuickBooks Connected Successfully!</div>
          <div class="message">You can now close this window and return to your application.</div>
          <script>
            // Try to close the window
            setTimeout(() => {
              window.close();
            }, 2000);
            
            // Also try to communicate with parent window if opened in popup
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'quickbooks_oauth_success', 
                realmId: '${realmId}' 
              }, '*');
            }
          </script>
        </body>
        </html>
      `;

      return new Response(successHtml, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/html' 
        },
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid action'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('=== ERROR IN QUICKBOOKS OAUTH FUNCTION ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Return HTML error page for GET requests (OAuth callbacks)
    if (req.method === 'GET') {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>QuickBooks Connection Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #dc3545; font-size: 24px; margin-bottom: 20px; }
            .message { color: #666; margin-bottom: 30px; }
          </style>
        </head>
        <body>
          <div class="error">❌ QuickBooks Connection Failed</div>
          <div class="message">Error: ${error.message}</div>
          <div class="message">Please close this window and try again.</div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'quickbooks_oauth_error', 
                error: '${error.message}' 
              }, '*');
            }
          </script>
        </body>
      </html>
      `;
      
      return new Response(errorHtml, {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'text/html' },
      });
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

function generateQuickBooksAuthUrl(clientId: string, redirectUrl: string): string {
  const baseUrl = 'https://appcenter.intuit.com/connect/oauth2';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUrl,
    response_type: 'code',
    access_type: 'offline',
    state: crypto.randomUUID()
  });

  return `${baseUrl}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string, realmId: string, clientId: string, clientSecret: string, redirectUrl: string): Promise<any> {
  console.log('=== TOKEN EXCHANGE STARTED ===');
  console.log('Exchange parameters:', {
    hasCode: !!code,
    realmId,
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    redirectUrl
  });
  
  const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUrl
  });

  console.log('Making token exchange request to:', tokenUrl);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: body.toString()
  });

  console.log('Token exchange response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('=== TOKEN EXCHANGE FAILED ===');
    console.error('Response status:', response.status, response.statusText);
    console.error('Error response:', errorText);
    throw new Error(`Failed to exchange code for tokens: ${response.statusText}`);
  }

  const tokenResponse = await response.json();
  console.log('=== TOKEN EXCHANGE SUCCESS ===');
  console.log('Token response keys:', Object.keys(tokenResponse));
  return tokenResponse;
}

serve(serve_handler);