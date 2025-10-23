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

interface QuickBooksWebhookPayload {
  eventNotifications: Array<{
    realmId: string;
    dataChangeEvent: {
      entities: Array<{
        name: string;
        id: string;
        operation: string;
        lastUpdated: string;
      }>;
    };
  }>;
}

const serve_handler = async (req: Request): Promise<Response> => {
  console.log('=== QUICKBOOKS WEBHOOK RECEIVER INVOKED ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the raw body for signature verification
    const rawBody = await req.text();
    console.log('Raw webhook payload received, length:', rawBody.length);

    // Verify webhook signature (QuickBooks uses HMAC-SHA256)
    const signature = req.headers.get('intuit-signature');
    if (signature) {
      const isValid = await verifyWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid webhook signature'
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      console.warn('No signature provided - webhook may not be from QuickBooks');
    }

    // Parse the JSON payload
    let webhookPayload: QuickBooksWebhookPayload;
    try {
      webhookPayload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Failed to parse webhook payload:', parseError);
      throw new Error('Invalid JSON payload');
    }

    console.log('Parsed webhook payload:', JSON.stringify(webhookPayload, null, 2));

    const results = [];

    // Process each event notification
    for (const notification of webhookPayload.eventNotifications || []) {
      const realmId = notification.realmId;
      console.log(`Processing notification for realm: ${realmId}`);

      // Process each entity change
      for (const entity of notification.dataChangeEvent?.entities || []) {
        console.log(`Processing entity: ${entity.name} (ID: ${entity.id}, Operation: ${entity.operation})`);

        // We're interested in Invoice entities that were updated
        if (entity.name === 'Invoice' && entity.operation === 'Update') {
          const result = await processInvoiceUpdate(entity.id, realmId);
          results.push(result);
        }
        // We're also interested in Payment entities that were created
        else if (entity.name === 'Payment' && entity.operation === 'Create') {
          const result = await processPaymentCreate(entity.id, realmId);
          results.push(result);
        }
      }
    }

    // Log the webhook event
    await supabase
      .from('webhook_logs')
      .insert({
        event_type: 'quickbooks_webhook',
        payload: webhookPayload,
        results: results,
        executed_at: new Date().toISOString()
      });

    return new Response(JSON.stringify({
      success: true,
      processed_entities: results.length,
      results: results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in quickbooks-webhook-receiver function:', error);
    
    // Log the error
    await supabase
      .from('webhook_logs')
      .insert({
        event_type: 'quickbooks_webhook_error',
        payload: { error: error.message },
        results: [{ error: error.message }],
        executed_at: new Date().toISOString()
      });

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

async function verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
  try {
    // Get webhook verification token from environment
    const webhookToken = Deno.env.get('QUICKBOOKS_WEBHOOK_TOKEN');
    
    if (!webhookToken) {
      console.warn('No webhook token configured - skipping signature verification');
      return true; // Allow webhook to proceed if no token is configured
    }

    // QuickBooks uses HMAC-SHA256 for webhook signatures
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // QuickBooks signature format is typically "intuit-signature=<base64-encoded-signature>"
    const providedSignature = signature.replace('intuit-signature=', '');

    const isValid = expectedSignature === providedSignature;
    console.log('Signature verification result:', isValid);
    
    return isValid;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

async function processInvoiceUpdate(invoiceId: string, realmId: string): Promise<any> {
  console.log(`Processing invoice update: ${invoiceId} for realm: ${realmId}`);

  try {
    // Get QuickBooks access token
    const { data: tokenData, error: tokenError } = await supabase
      .from('quickbooks_tokens')
      .select('*')
      .eq('realm_id', realmId)
      .single();

    if (tokenError || !tokenData) {
      console.error('No QuickBooks token found for realm:', realmId);
      return {
        invoiceId,
        success: false,
        error: 'No QuickBooks token found for this realm'
      };
    }

    // Ensure token is valid
    const currentToken = await ensureValidToken(tokenData);

    // Fetch invoice details from QuickBooks
    const invoiceDetails = await fetchInvoiceFromQuickBooks(invoiceId, realmId, currentToken);
    
    if (!invoiceDetails) {
      return {
        invoiceId,
        success: false,
        error: 'Could not fetch invoice details from QuickBooks'
      };
    }

    console.log('Invoice details fetched:', {
      id: invoiceDetails.Id,
      docNumber: invoiceDetails.DocNumber,
      balance: invoiceDetails.Balance,
      totalAmt: invoiceDetails.TotalAmt
    });

    // Find the corresponding lead in our database
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('quickbooks_invoice_id', invoiceId)
      .maybeSingle();

    if (leadError) {
      console.error('Error finding lead:', leadError);
      return {
        invoiceId,
        success: false,
        error: 'Error finding lead in database'
      };
    }

    if (!lead) {
      console.log('No lead found for invoice ID:', invoiceId);
      return {
        invoiceId,
        success: false,
        error: 'No lead found for this invoice'
      };
    }

    console.log(`Found lead: ${lead.id} (${lead.director_email})`);

    // Check if invoice is paid (Balance = 0 and TotalAmt > 0)
    const isPaid = invoiceDetails.Balance === 0 && invoiceDetails.TotalAmt > 0;
    console.log('Invoice payment status:', { 
      balance: invoiceDetails.Balance, 
      totalAmt: invoiceDetails.TotalAmt, 
      isPaid 
    });

    if (isPaid && lead.status !== 'Converted - Paid') {
      console.log('Invoice is paid, updating lead status to Converted - Paid');

      // Update lead status to converted
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          status: 'Converted - Paid',
          payment_date: new Date().toISOString(),
          invoice_status: 'paid',
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (updateError) {
        console.error('Error updating lead status:', updateError);
        throw updateError;
      }

      // Log the payment event
      await supabase
        .from('communication_history')
        .insert({
          lead_id: lead.id,
          communication_type: 'payment',
          direction: 'inbound',
          subject: 'Payment received via QuickBooks',
          content: `Invoice ${invoiceDetails.DocNumber} has been paid. Amount: $${invoiceDetails.TotalAmt}`,
          sent_at: new Date().toISOString(),
          metadata: {
            quickbooks_invoice_id: invoiceId,
            invoice_number: invoiceDetails.DocNumber,
            amount_paid: invoiceDetails.TotalAmt,
            payment_source: 'quickbooks_webhook'
          }
        });

      console.log('Lead status updated to Converted - Paid');

      return {
        invoiceId,
        leadId: lead.id,
        success: true,
        action: 'status_updated_to_paid',
        message: `Lead ${lead.director_first_name} ${lead.director_last_name} marked as Converted - Paid`
      };
    } else if (!isPaid) {
      console.log('Invoice is not yet paid, no action needed');
      return {
        invoiceId,
        leadId: lead.id,
        success: true,
        action: 'no_action_needed',
        message: 'Invoice not yet paid'
      };
    } else {
      console.log('Lead already marked as paid');
      return {
        invoiceId,
        leadId: lead.id,
        success: true,
        action: 'already_paid',
        message: 'Lead already marked as paid'
      };
    }

  } catch (error: any) {
    console.error('Error processing invoice update:', error);
    return {
      invoiceId,
      success: false,
      error: error.message
    };
  }
}

async function processPaymentCreate(paymentId: string, realmId: string): Promise<any> {
  console.log(`Processing payment creation: ${paymentId} for realm: ${realmId}`);

  try {
    // Get QuickBooks access token
    const { data: tokenData, error: tokenError } = await supabase
      .from('quickbooks_tokens')
      .select('*')
      .eq('realm_id', realmId)
      .single();

    if (tokenError || !tokenData) {
      console.error('No QuickBooks token found for realm:', realmId);
      return {
        paymentId,
        success: false,
        error: 'No QuickBooks token found for this realm'
      };
    }

    // Ensure token is valid
    const currentToken = await ensureValidToken(tokenData);

    // Fetch payment details from QuickBooks
    const paymentDetails = await fetchPaymentFromQuickBooks(paymentId, realmId, currentToken);
    
    if (!paymentDetails) {
      return {
        paymentId,
        success: false,
        error: 'Could not fetch payment details from QuickBooks'
      };
    }

    console.log('Payment details fetched:', {
      id: paymentDetails.Id,
      totalAmt: paymentDetails.TotalAmt,
      linkedTxnCount: paymentDetails.LinkedTxn?.length || 0
    });

    const results = [];

    // Process each linked transaction (typically invoices)
    if (paymentDetails.LinkedTxn && paymentDetails.LinkedTxn.length > 0) {
      for (const linkedTxn of paymentDetails.LinkedTxn) {
        if (linkedTxn.TxnType === 'Invoice') {
          console.log(`Processing linked invoice: ${linkedTxn.TxnId}`);
          
          // Process the invoice update to check if it's now paid
          const invoiceResult = await processInvoiceUpdate(linkedTxn.TxnId, realmId);
          results.push({
            type: 'linked_invoice',
            invoiceId: linkedTxn.TxnId,
            result: invoiceResult
          });
        }
      }
    } else {
      console.log('No linked transactions found in payment');
    }

    return {
      paymentId,
      success: true,
      action: 'payment_processed',
      linkedInvoices: results.length,
      results: results,
      message: `Payment ${paymentId} processed with ${results.length} linked invoices`
    };

  } catch (error: any) {
    console.error('Error processing payment creation:', error);
    return {
      paymentId,
      success: false,
      error: error.message
    };
  }
}

async function fetchPaymentFromQuickBooks(paymentId: string, realmId: string, accessToken: string): Promise<any> {
  const apiUrl = `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/payment/${paymentId}`;
  
  console.log('Fetching payment from QuickBooks:', apiUrl);

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('QuickBooks API error fetching payment:', response.status, errorText);
    throw new Error(`Failed to fetch payment from QuickBooks: ${response.statusText}`);
  }

  const data = await response.json();
  return data.QueryResponse?.Payment?.[0] || null;
}

async function fetchInvoiceFromQuickBooks(invoiceId: string, realmId: string, accessToken: string): Promise<any> {
  const apiUrl = `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}`;
  
  console.log('Fetching invoice from QuickBooks:', apiUrl);

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('QuickBooks API error:', response.status, errorText);
    throw new Error(`Failed to fetch invoice from QuickBooks: ${response.statusText}`);
  }

  const data = await response.json();
  return data.QueryResponse?.Invoice?.[0] || null;
}

async function ensureValidToken(tokenData: any): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(tokenData.expires_at);

  // If token expires within 5 minutes, refresh it
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log('Token expiring soon, refreshing...');
    return await refreshAccessToken(tokenData);
  }

  return tokenData.access_token;
}

async function refreshAccessToken(tokenData: any): Promise<string> {
  const { data: credentials, error } = await supabase
    .from('integration_credentials')
    .select('client_id, client_secret')
    .eq('integration_name', 'quickbooks')
    .single();

  if (error || !credentials) {
    throw new Error('QuickBooks credentials not found');
  }

  const refreshUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
  
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokenData.refresh_token
  });

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${credentials.client_id}:${credentials.client_secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token refresh failed:', errorText);
    throw new Error('Failed to refresh QuickBooks token');
  }

  const newTokenData = await response.json();

  // Update stored token
  await supabase
    .from('quickbooks_tokens')
    .update({
      access_token: newTokenData.access_token,
      refresh_token: newTokenData.refresh_token || tokenData.refresh_token,
      expires_at: new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('realm_id', tokenData.realm_id);

  console.log('Token refreshed successfully');
  return newTokenData.access_token;
}

serve(serve_handler);