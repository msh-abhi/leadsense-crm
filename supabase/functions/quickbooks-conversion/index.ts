import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

// Inline logger utility
interface LogContext {
  function_name?: string;
  lead_id?: string;
  error_details?: any;
  [key: string]: any;
}

async function log(
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  message: string,
  context?: LogContext
) {
  try {
    const logEntry = {
      level,
      message,
      function_name: context?.function_name,
      lead_id: context?.lead_id,
      error_details: context?.error_details,
      context: context ? { ...context } : null
    };

    // Remove specific fields from context to avoid duplication
    if (logEntry.context) {
      delete logEntry.context.function_name;
      delete logEntry.context.lead_id;
      delete logEntry.context.error_details;
    }

    const { error } = await supabase
      .from('logs')
      .insert(logEntry);

    if (error) {
      // Don't use logger here, just console.error
      console.error('Failed to write log to database:', error.message);
    }
  } catch (e) {
    console.error('Critical error in logger utility:', e);
  }
}

const logger = {
  info: (message: string, context?: LogContext) => log('INFO', message, context),
  warn: (message: string, context?: LogContext) => log('WARN', message, context),
  error: (message: string, context?: LogContext) => log('ERROR', message, context),
  debug: (message: string, context?: LogContext) => log('DEBUG', message, context),
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// --- Add this helper so fetch calls don't hang forever ---
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    // Re-throw so existing error handling picks it up
    throw err;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversionRequest {
  leadId: string;
  leadData?: any;
}

async function getQuickBooksCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
}> {
  const { data, error } = await supabase
    .from('integration_credentials')
    .select('client_id, client_secret')
    .eq('integration_name', 'quickbooks')
    .single();

  if (error || !data) {
    throw new Error('QuickBooks credentials not configured. Please set up credentials in the Integration Hub first.');
  }

  return {
    clientId: data.client_id,
    clientSecret: data.client_secret
  };
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let currentLeadId: string | undefined;

  try {
    const { leadId }: ConversionRequest = await req.json();
    currentLeadId = leadId; // Store leadId for catch block
    
    if (!leadId) {
      throw new Error('Missing leadId in request body');
    }

    await logger.info('Starting QuickBooks conversion', {
      function_name: 'quickbooks-conversion',
      lead_id: leadId
    });

    // Get lead data
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !leadData) {
      throw new Error(`Failed to fetch lead data for ID: ${leadId}. Error: ${leadError?.message}`);
    }

    // Get QuickBooks tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from('quickbooks_tokens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData) {
      await logger.warn('QuickBooks not connected, skipping conversion', {
        function_name: 'quickbooks-conversion',
        lead_id: leadId,
        error_details: tokenError?.message
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'QuickBooks not connected. Please complete OAuth setup first.',
        details: 'No valid QuickBooks tokens found. Please reconnect your QuickBooks integration in the Integration Hub.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log token information for debugging (without exposing sensitive data)
    await logger.info('QuickBooks token found', {
      function_name: 'quickbooks-conversion',
      lead_id: leadId,
      realm_id: tokenData.realm_id,
      token_expires: tokenData.expires_at,
      token_updated: tokenData.updated_at
    });

    // Ensure token is valid
    const currentToken = await ensureValidToken(tokenData);

    // Create or get customer
    let customerId = leadData.quickbooks_customer_id;

    if (!customerId) {
      try {
        await logger.info('Attempting to create new QuickBooks customer', {
          function_name: 'quickbooks-conversion',
          lead_id: leadId,
          customer_name: `${leadData.director_first_name} ${leadData.director_last_name}`
        });

        customerId = await createQuickBooksCustomer(leadData, currentToken, tokenData.realm_id);
        
        await logger.info('QuickBooks customer created successfully', {
          function_name: 'quickbooks-conversion',
          lead_id: leadId,
          customer_id: customerId
        });

        // Verify customer was actually created in QuickBooks
        const isCustomerValid = await verifyCustomerExists(customerId, currentToken, tokenData.realm_id);
        if (!isCustomerValid) {
          throw new Error(`Customer creation verification failed - customer ${customerId} not found in QuickBooks`);
        }

        // Update lead with customer ID
        const { error: updateError } = await supabase
          .from('leads')
          .update({ quickbooks_customer_id: customerId })
          .eq('id', leadId);

        if (updateError) {
          await logger.error('Failed to update lead with customer ID', {
            function_name: 'quickbooks-conversion',
            lead_id: leadId,
            error_details: updateError.message
          });
        } else {
          await logger.info('Stored QuickBooks Customer ID in Supabase', {
            function_name: 'quickbooks-conversion',
            lead_id: leadId,
            customer_id: customerId
          });
        }
      } catch (customerError: any) {
        await logger.error('Customer creation failed', {
          function_name: 'quickbooks-conversion',
          lead_id: leadId,
          error_details: customerError.message
        });

        // If duplicate name error, try to find existing customer
        if (customerError.message.includes('Duplicate Name')) {
          try {
            customerId = await findExistingCustomer(leadData, currentToken, tokenData.realm_id);
            await logger.info('Found existing QuickBooks customer', {
              function_name: 'quickbooks-conversion',
              lead_id: leadId,
              customer_id: customerId
            });

            await supabase
              .from('leads')
              .update({ quickbooks_customer_id: customerId })
              .eq('id', leadId);
          } catch (searchError: any) {
            await logger.error('Customer search also failed', {
              function_name: 'quickbooks-conversion',
              lead_id: leadId,
              error_details: searchError.message
            });
            throw new Error(`QuickBooks customer search failed: ${searchError.message}`);
          }
        } else {
          throw customerError;
        }
      }
    } else {
      await logger.info('Using existing QuickBooks customer ID', {
        function_name: 'quickbooks-conversion',
        lead_id: leadId,
        customer_id: customerId
      });

      // Verify existing customer still exists in QuickBooks
      const isCustomerValid = await verifyCustomerExists(customerId, currentToken, tokenData.realm_id);
      if (!isCustomerValid) {
        await logger.warn('Existing customer not found in QuickBooks, creating new one', {
          function_name: 'quickbooks-conversion',
          lead_id: leadId,
          old_customer_id: customerId
        });

        // Clear the old customer ID and create a new one
        await supabase
          .from('leads')
          .update({ quickbooks_customer_id: null })
          .eq('id', leadId);

        customerId = await createQuickBooksCustomer(leadData, currentToken, tokenData.realm_id);
        await supabase
          .from('leads')
          .update({ quickbooks_customer_id: customerId })
          .eq('id', leadId);
      }
    }

    // Create invoice
    await logger.info('Attempting to create QuickBooks invoice', {
      function_name: 'quickbooks-conversion',
      lead_id: leadId,
      customer_id: customerId,
      amount: leadData.discount_rate_dr || leadData.standard_rate_sr || 500
    });

    // This function now creates the invoice, sends it, and returns all correct IDs/links
    const invoiceResult = await createQuickBooksInvoice(leadData, customerId, currentToken, tokenData.realm_id);
    
    await logger.info('QuickBooks invoice created and share link fetched successfully', {
      function_name: 'quickbooks-conversion',
      lead_id: leadId,
      invoice_id: invoiceResult.invoiceId,         // This is the Transaction ID
      doc_number: invoiceResult.docNumber,         // This is the Invoice Number
      total_amount: invoiceResult.totalAmount,
      payment_link: invoiceResult.paymentLink     // This is the real Share Link
    });

    const paymentLink = invoiceResult.paymentLink;

    if (!paymentLink) {
       await logger.warn('Could not retrieve QuickBooks payment link after send', {
          function_name: 'quickbooks-conversion',
          lead_id: leadId,
          invoice_id: invoiceResult.invoiceId
       });
    }

    // Update lead with correct invoice information and payment link
    await supabase
      .from('leads')
      .update({
        status: 'Invoice Created',
        invoice_status: 'created',
        quickbooks_customer_id: customerId,
        quickbooks_invoice_id: invoiceResult.invoiceId.toString(),   // Store QBO Transaction ID
        quickbooks_invoice_number: invoiceResult.docNumber,          // Store QBO Invoice Number
        quickbooks_payment_link: paymentLink,                      // Store QBO Share Link
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    // Log the conversion event
    await supabase
      .from('communication_history')
      .insert({
        lead_id: leadId,
        communication_type: 'invoice',
        direction: 'outbound',
        subject: 'QuickBooks invoice created',
        content: `Invoice ${invoiceResult.docNumber || invoiceResult.invoiceId} created in QuickBooks for $${invoiceResult.totalAmount}`,
        sent_at: new Date().toISOString(),
        metadata: {
          quickbooks_customer_id: customerId,
          quickbooks_invoice_id: invoiceResult.invoiceId,    // Transaction ID
          invoice_number: invoiceResult.docNumber,         // Invoice Number
          total_amount: invoiceResult.totalAmount,
          payment_link: paymentLink
        }
      });

    return new Response(JSON.stringify({
      success: true,
      leadId,
      customerId,
      invoiceId: invoiceResult.invoiceId,   // Transaction ID
      docNumber: invoiceResult.docNumber,   // Invoice Number
      totalAmount: invoiceResult.totalAmount,
      paymentLink: paymentLink,             // Share Link
      message: 'Invoice created successfully in QuickBooks'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    // **LOGGER FIX:** Must 'await' the logger in the catch block
    // This ensures the log is written before the function returns a 500
    await logger.error('CRITICAL_ERROR in serve_handler catch block', {
      function_name: 'serve_handler',
      lead_id: currentLeadId, // Log leadId if available
      error_details: error.message,
      stack: error.stack
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

async function ensureValidToken(tokenData: any): Promise<string> {
  const now = new Date();
  const expiresAt = new Date(tokenData.expires_at);

  // If token expires within 5 minutes, refresh it
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    await logger.info('Token expiring soon, refreshing', {
      function_name: 'ensureValidToken'
    });
    return await refreshAccessToken(tokenData);
  }

  return tokenData.access_token;
}

async function refreshAccessToken(tokenData: any): Promise<string> {
  const credentials = await getQuickBooksCredentials();
  const refreshUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokenData.refresh_token
  });

  // Use fetchWithTimeout for token refresh (longer timeout in case Intuit's OAuth is slow)
  const response = await fetchWithTimeout(refreshUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: body.toString()
  }, 30000);

  if (!response.ok) {
    const errorText = await response.text();
    await logger.error('Token refresh failed', {
      function_name: 'refreshAccessToken',
      error_details: errorText,
      status_code: response.status,
      status_text: response.statusText
    });

    // Provide more detailed error information for production migration
    let errorMessage = 'Failed to refresh QuickBooks token';
    if (response.status === 400) {
      errorMessage = 'Invalid refresh token. Please reconnect QuickBooks in production mode.';
    } else if (response.status === 401) {
      errorMessage = 'Authentication failed. Please check QuickBooks production credentials.';
    } else if (response.status === 403) {
      errorMessage = 'Authorization failed (403). Please check your QuickBooks production API permissions or reconnect the integration.';
    }

    throw new Error(errorMessage);
  }

  const newTokenData = await response.json();

  if (!newTokenData.access_token) {
    throw new Error('Invalid response from QuickBooks token refresh - no access token received');
  }

  // Update stored token (only token-related fields)
  const { error: updateError } = await supabase
    .from('quickbooks_tokens')
    .update({
      access_token: newTokenData.access_token,
      refresh_token: newTokenData.refresh_token || tokenData.refresh_token,
      expires_at: new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('realm_id', tokenData.realm_id);

  if (updateError) {
    // Can't use logger here if logger fails, but we'll try
    await logger.error('Failed to update token in database', {
      function_name: 'refreshAccessToken',
      error_details: updateError.message
    });
    throw new Error('Failed to save refreshed token to database');
  }

  await logger.info('Token refreshed successfully', {
    function_name: 'refreshAccessToken',
    new_expires_at: new Date(Date.now() + (newTokenData.expires_in * 1000)).toISOString()
  });
  return newTokenData.access_token;
}

async function createQuickBooksCustomer(leadData: any, accessToken: string, realmId: string): Promise<string> {
  const customerData: any = {
    DisplayName: `${leadData.director_first_name} ${leadData.director_last_name}`,
    GivenName: leadData.director_first_name,
    FamilyName: leadData.director_last_name,
    PrimaryEmailAddr: {
      Address: leadData.director_email
    }
  };

  // Add company name if available
  const companyName = leadData.school_name || leadData.ensemble_program_name;
  if (companyName && companyName.trim()) {
    customerData.CompanyName = companyName.trim();
  }

  // Add phone number if available
  if (leadData.director_phone_number && leadData.director_phone_number.trim()) {
    customerData.PrimaryPhone = {
      FreeFormNumber: leadData.director_phone_number.trim()
    };
  }
  
  // Use console.log as a fallback logger that won't fail
  console.log('Creating QuickBooks customer with data:', {
    DisplayName: customerData.DisplayName,
    CompanyName: customerData.CompanyName,
    PrimaryEmailAddr: customerData.PrimaryEmailAddr
  });

  await logger.info('Making QuickBooks customer creation API call', {
    function_name: 'createQuickBooksCustomer',
    realm_id: realmId,
    customer_name: customerData.DisplayName
  });

  const response = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/customer`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(customerData)
  }, 20000);

  await logger.info('QuickBooks customer creation API response received', {
    function_name: 'createQuickBooksCustomer',
    status: response.status,
    status_text: response.statusText
  });

  if (!response.ok) {
    const errorText = await response.text();
    await logger.error('QuickBooks customer creation failed', {
      function_name: 'createQuickBooksCustomer',
      status: response.status,
      status_text: response.statusText,
      error_details: errorText,
      realm_id: realmId,
      customer_data: customerData
    });

    // Provide specific error messages for common issues
    if (response.status === 403) {
      throw new Error(`QuickBooks authorization failed (403). Please check your production app permissions or reconnect your QuickBooks integration. Details: ${errorText}`);
    } else if (response.status === 401) {
      throw new Error(`QuickBooks authentication failed (401). Your access token may be invalid. Please reconnect your QuickBooks integration. Details: ${errorText}`);
    } else if (response.status === 400) {
      throw new Error(`QuickBooks bad request (400). Please check your customer data format. Details: ${errorText}`);
    } else {
      throw new Error(`QuickBooks customer creation failed with status ${response.status}: ${response.statusText}. Details: ${errorText}`);
    }
  }

  const result = await response.json();

  await logger.debug('QuickBooks customer creation response structure', {
    function_name: 'createQuickBooksCustomer',
    has_customer: !!result.Customer,
    customer_id: result.Customer?.Id,
    response_keys: Object.keys(result)
  });

  if (result.Customer && result.Customer.Id) {
    await logger.info('QuickBooks customer created successfully', {
      function_name: 'createQuickBooksCustomer',
      customer_id: result.Customer.Id,
      customer_name: result.Customer.DisplayName
    });
    return result.Customer.Id;
  }

  await logger.error('QuickBooks create customer response missing Customer.Id', {
    function_name: 'createQuickBooksCustomer',
    response_structure: JSON.stringify(result, null, 2)
  });
  throw new Error('QuickBooks API returned an invalid response for customer creation - no Customer.Id found');
}

async function findExistingCustomer(leadData: any, accessToken: string, realmId: string): Promise<string> {
  const customerName = `${leadData.director_first_name} ${leadData.director_last_name}`;
  const query = `SELECT * FROM Customer WHERE DisplayName = '${customerName.replace(/'/g, "\\'")}'`;

  const response = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  }, 15000);

  if (!response.ok) {
    const errorText = await response.text();
    await logger.error('QuickBooks customer search error', {
      function_name: 'findExistingCustomer',
      error_details: errorText
    });
    throw new Error(`QuickBooks customer search failed: ${response.statusText}`);
  }

  const result = await response.json();

  if (result.QueryResponse && result.QueryResponse.Customer && result.QueryResponse.Customer.length > 0) {
    return result.QueryResponse.Customer[0].Id;
  }

  throw new Error('No existing customer found with matching name');
}

async function ensureCustomerEmailIsValid(customerId: string, leadEmail: string, accessToken: string, realmId: string): Promise<void> {
  try {
    await logger.info('Checking customer email before sending invoice', {
      function_name: 'ensureCustomerEmailIsValid',
      customer_id: customerId,
      lead_email: leadEmail
    });

    const response = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/customer/${customerId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }, 15000);

    if (!response.ok) {
      await logger.warn('Could not fetch customer for email verification', {
        function_name: 'ensureCustomerEmailIsValid',
        customer_id: customerId,
        status: response.status
      });
      return; // Don't throw, just log and continue
    }

    const result = await response.json();

    if (result.Customer) {
      const customer = result.Customer;
      const hasValidEmail = customer.PrimaryEmailAddr && customer.PrimaryEmailAddr.Address;

      await logger.info('Customer email verification result', {
        function_name: 'ensureCustomerEmailIsValid',
        customer_id: customerId,
        has_email: hasValidEmail,
        current_email: customer.PrimaryEmailAddr?.Address,
        expected_email: leadEmail
      });

      // If customer doesn't have email or email doesn't match, update it
      if (!hasValidEmail || customer.PrimaryEmailAddr.Address !== leadEmail) {
        await logger.info('Updating customer email address', {
          function_name: 'ensureCustomerEmailIsValid',
          customer_id: customerId,
          old_email: customer.PrimaryEmailAddr?.Address,
          new_email: leadEmail
        });

        // Get customer SyncToken for update
        const syncToken = customer.SyncToken;

        const updateResponse = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/customer`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            Id: customerId,
            SyncToken: syncToken,
            PrimaryEmailAddr: {
              Address: leadEmail
            }
          })
        }, 20000);

        if (updateResponse.ok) {
          await logger.info('Successfully updated customer email address', {
            function_name: 'ensureCustomerEmailIsValid',
            customer_id: customerId,
            new_email: leadEmail
          });
        } else {
          const errorText = await updateResponse.text();
          await logger.warn('Failed to update customer email address', {
            function_name: 'ensureCustomerEmailIsValid',
            customer_id: customerId,
            status: updateResponse.status,
            error_details: errorText
          });
          // Don't throw - continue with invoice send anyway
        }
      } else {
        await logger.info('Customer already has correct email address', {
          function_name: 'ensureCustomerEmailIsValid',
          customer_id: customerId,
          email: leadEmail
        });
      }
    }
  } catch (error: any) {
    await logger.error('Exception during customer email verification/update', {
      function_name: 'ensureCustomerEmailIsValid',
      customer_id: customerId,
      error_details: error.message
    });
    // Don't throw - continue with invoice send anyway
  }
}

async function verifyCustomerExists(customerId: string, accessToken: string, realmId: string): Promise<boolean> {
  try {
    await logger.debug('Verifying customer exists in QuickBooks', {
      function_name: 'verifyCustomerExists',
      customer_id: customerId
    });

    const response = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/customer/${customerId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }, 15000);

    if (response.ok) {
      const result = await response.json();
      const exists = !!(result.Customer && result.Customer.Id === customerId);

      await logger.info('Customer verification result', {
        function_name: 'verifyCustomerExists',
        customer_id: customerId,
        exists: exists
      });

      return exists;
    } else if (response.status === 404) {
      await logger.warn('Customer not found in QuickBooks', {
        function_name: 'verifyCustomerExists',
        customer_id: customerId,
        status: response.status
      });
      return false;
    } else {
      const errorText = await response.text();
      await logger.error('Error verifying customer in QuickBooks', {
        function_name: 'verifyCustomerExists',
        customer_id: customerId,
        status: response.status,
        error_details: errorText
      });
      return false;
    }
  } catch (error: any) {
    await logger.error('Exception during customer verification', {
      function_name: 'verifyCustomerExists',
      customer_id: customerId,
      error_details: error.message
    });
    return false;
  }
}

async function createQuickBooksInvoice(leadData: any, customerId: string, accessToken: string, realmId: string): Promise<{
  invoiceId: string; // Transaction ID
  docNumber: string; // Invoice Number
  totalAmount: number;
  paymentLink: string | null;
}> {
  const amount = leadData.discount_rate_dr || leadData.standard_rate_sr || 500;
  
  // Get or create service item
  const serviceItemId = await getOrCreateServiceItem(accessToken, realmId);
  
  // Get default tax code (may return null to allow AST to apply)
  const taxCodeObj = await getDefaultTaxCode(accessToken, realmId);

  // Build SalesItemLineDetail with conditional TaxCodeRef
  const salesItemLineDetail: any = {
    ItemRef: { value: serviceItemId },
    Qty: 1,
    UnitPrice: amount
  };

  if (taxCodeObj && taxCodeObj.value) {
    salesItemLineDetail.TaxCodeRef = taxCodeObj;
  }

  const invoiceData: any = {
    CustomerRef: { value: customerId },
    BillEmail: {
      Address: leadData.director_email
    },
    Line: [{
      Amount: amount,
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: salesItemLineDetail,
      Description: `LeadSense CRM Program - ${leadData.workout_program_name || leadData.ensemble_program_name || 'Training Program'}`
    }],
    AllowOnlineCreditCardPayment: true,
    AllowOnlineACHPayment: true
  };

  console.log('Creating QuickBooks invoice with data:', {
    customerId,
    amount,
    serviceItemId,
    taxCode: taxCodeObj ? taxCodeObj.value : null,
    description: invoiceData.Line[0].Description,
    billEmail: invoiceData.BillEmail
  });

  const apiUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice?minorversion=75`;

  // Use timeout wrapper to fail fast if QBO hangs
  let response;
  try {
    response = await fetchWithTimeout(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(invoiceData)
    }, 30000); // 30s timeout
  } catch (err: any) {
    await logger.error('Fetch to create invoice aborted or failed', {
      function_name: 'createQuickBooksInvoice',
      error_details: err.message
    });
    throw new Error('Timed out or failed while calling QuickBooks invoice creation API');
  }

  if (!response.ok) {
    const errorText = await response.text();
    await logger.error('QuickBooks invoice creation error', {
      function_name: 'createQuickBooksInvoice',
      status: response.status,
      status_text: response.statusText,
      error_details: errorText,
      sent_data: invoiceData
    });
    throw new Error(`Failed to create QuickBooks invoice: ${response.statusText}. Details: ${errorText}`);
  }

  const result = await response.json();
  
  if (!result.Invoice || !result.Invoice.Id) {
    await logger.error('QuickBooks invoice creation response missing Invoice.Id', {
      function_name: 'createQuickBooksInvoice',
      error_details: JSON.stringify(result)
    });
    throw new Error('QuickBooks API returned an invalid response for invoice creation.');
  }

  const invoiceId = result.Invoice.Id;
  const docNumber = result.Invoice.DocNumber;

  await logger.info('Invoice created, now fetching share link...', {
    function_name: 'createQuickBooksInvoice',
    invoice_id: invoiceId,
    doc_number: docNumber,
    customer_email: leadData.director_email
  });

  // Step 3: Add safeguard to ensure customer has valid email before sending
  await ensureCustomerEmailIsValid(customerId, leadData.director_email, accessToken, realmId);

  const shareLink = await sendInvoiceAndGetShareLink(
    invoiceId,
    leadData.director_email,
    accessToken,
    realmId
  );

  return {
    invoiceId: invoiceId,
    docNumber: docNumber,
    totalAmount: result.Invoice.TotalAmt,
    paymentLink: shareLink
  };
}

/**
 * Sends the invoice via QBO API (which generates the share link)
 * and then fetches the invoice again to retrieve that link.
 */
async function sendInvoiceAndGetShareLink(
  invoiceId: string,
  leadEmail: string,
  accessToken: string,
  realmId: string
): Promise<string | null> {
  const function_name = 'sendInvoiceAndGetShareLink';
  const log_context = { function_name, invoice_id: invoiceId };
  
  const minorVersionQuery = 'minorversion=75';
  const fetchUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}?${minorVersionQuery}`;
  const sendUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}/invoice/${invoiceId}/send?${minorVersionQuery}`;

  try {
    // 1. First, fetch the invoice. The link might exist now.
    await logger.info('Fetching newly created invoice to check for InvoiceLink', log_context);
    let fetchResponse = await fetchWithTimeout(fetchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }, 15000); // 15s

    await logger.info('Initial fetch response status', { ...log_context, status: fetchResponse.status });

    if (fetchResponse.ok) {
      const invoiceData = await fetchResponse.json();
      if (invoiceData.Invoice && invoiceData.Invoice.InvoiceLink) {
        await logger.info('Found InvoiceLink on initial fetch (no send needed)', {
          ...log_context,
          payment_link: invoiceData.Invoice.InvoiceLink
        });
        return invoiceData.Invoice.InvoiceLink; // Return link immediately
      }
    } else {
      await logger.warn('Failed to fetch invoice post-creation, proceeding to send', log_context);
    }

    // 2. If no link, send the invoice to generate it.
    await logger.info('InvoiceLink not found, sending invoice via API to generate link', {
      ...log_context,
      email: leadEmail
    });
    
    const sendResponse = await fetchWithTimeout(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        // QBO expects SendTo as an array of addresses; Primary flag helps
        SendTo: [
          { Address: leadEmail, Primary: true }
        ]
      })
    }, 20000); // 20s timeout for send

    await logger.info('Send invoice response status', { ...log_context, status: sendResponse.status, ok: sendResponse.ok });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      await logger.error('Failed to send QuickBooks invoice', {
        ...log_context,
        error_details: errorText,
        status: sendResponse.status
      });
      // Don't throw; we can still try fetching again.
    } else {
        await logger.info('Successfully called send invoice endpoint', log_context);
    }

    // 3. Fetch the invoice *again* after sending to get the link
    await logger.info('Refetching invoice after send attempt to get InvoiceLink', log_context);
    
    fetchResponse = await fetchWithTimeout(fetchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    }, 15000);
    
    await logger.info('Second fetch response status', { ...log_context, status: fetchResponse.status });
    
    if (fetchResponse.ok) {
      const invoiceData = await fetchResponse.json();
      if (invoiceData.Invoice && invoiceData.Invoice.InvoiceLink) {
        await logger.info('Found InvoiceLink on second fetch (after send)', {
          ...log_context,
          payment_link: invoiceData.Invoice.InvoiceLink
        });
        return invoiceData.Invoice.InvoiceLink;
      } else {
        // **NEW DEBUG LOG**
        await logger.warn('Could not find InvoiceLink even after sending. Dumping invoice keys.', {
            ...log_context,
            invoice_keys: invoiceData.Invoice ? Object.keys(invoiceData.Invoice) : 'no_invoice_object_found'
        });
        return null;
      }
    } else {
        const errorText = await fetchResponse.text();
        await logger.error('Failed to refetch invoice after send', {
            ...log_context,
            status: fetchResponse.status,
            error_details: errorText
        });
        return null;
    }

  } catch (error: any) {
    await logger.error('Exception in sendInvoiceAndGetShareLink', {
      ...log_context,
      error_details: error.message
    });
    return null;
  }
}

async function getOrCreateServiceItem(accessToken: string, realmId: string): Promise<string> {
  const itemName = "LeadSense CRM Service";
  
  // First, try to find existing service item
  const query = `SELECT * FROM Item WHERE Name = '${itemName.replace(/'/g, "\\'")}'`;
  
  // search with timeout
  const searchResponse = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  }, 15000);

  if (searchResponse.ok) {
    const searchResult = await searchResponse.json();
    if (searchResult.QueryResponse && searchResult.QueryResponse.Item && searchResult.QueryResponse.Item.length > 0) {
      await logger.info('Found existing service item', {
        function_name: 'getOrCreateServiceItem',
        item_id: searchResult.QueryResponse.Item[0].Id
      });
      return searchResult.QueryResponse.Item[0].Id;
    }
  }

  // If not found, create new service item
  await logger.info('Creating new service item', {
    function_name: 'getOrCreateServiceItem',
    item_name: itemName
  });
  
  const incomeAccountId = await getDefaultIncomeAccount(accessToken, realmId);
  
  const itemData = {
    Name: itemName,
    Type: "Service",
    IncomeAccountRef: {
      value: incomeAccountId
    }
  };

  const createResponse = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/item`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(itemData)
  }, 20000);

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    await logger.error('QuickBooks service item creation error', {
      function_name: 'getOrCreateServiceItem',
      error_details: errorText
    });
    throw new Error(`Failed to create service item: ${errorText}`);
  }

  const createResult = await createResponse.json();
  
  if (createResult.Item) {
    await logger.info('Created new service item', {
      function_name: 'getOrCreateServiceItem',
      item_id: createResult.Item.Id
    });
    return createResult.Item.Id;
  }

  throw new Error('Invalid response when creating service item');
}

async function getDefaultTaxCode(accessToken: string, realmId: string): Promise<{ value?: string } | null> {
  // Return null to avoid sending TaxCodeRef so QuickBooks Automatic Sales Tax (AST)
  // can determine tax automatically. Sending 'NON' or any explicit TaxCodeRef
  // may conflict with AST and cause API timeouts for some company files.
  await logger.debug("Not sending TaxCodeRef so QBO Automatic Sales Tax can apply", {
    function_name: 'getDefaultTaxCode'
  });
  return null;
}

async function getDefaultIncomeAccount(accessToken: string, realmId: string): Promise<string> {
  const incomeQuery = "SELECT * FROM Account WHERE AccountType = 'Income' AND Classification = 'Revenue' AND Active = true";
  
  const response = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(incomeQuery)}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  }, 15000);

  if (response.ok) {
    const result = await response.json();
    if (result.QueryResponse && result.QueryResponse.Account && result.QueryResponse.Account.length > 0) {
      await logger.info('Found income account', {
        function_name: 'getDefaultIncomeAccount',
        account_id: result.QueryResponse.Account[0].Id
      });
      return result.QueryResponse.Account[0].Id;
    }
  }

  // If no income account found, try to create a default one
  await logger.info('No income account found, creating default', {
    function_name: 'getDefaultIncomeAccount'
  });
  return await createDefaultIncomeAccount(accessToken, realmId);
}

async function createDefaultIncomeAccount(accessToken: string, realmId: string): Promise<string> {
  const accountData = {
    Name: "Service Revenue",
    AccountType: "Income",
    AccountSubType: "ServiceFeeIncome"
  };

  const response = await fetchWithTimeout(`https://quickbooks.api.intuit.com/v3/company/${realmId}/account`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(accountData)
  }, 20000);

  if (!response.ok) {
    const errorText = await response.text();
    await logger.error('QuickBooks account creation error', {
      function_name: 'createDefaultIncomeAccount',
      error_details: errorText
    });
    throw new Error(`Failed to create income account: ${errorText}`);
  }

  const result = await response.json();
  
  if (result.Account && result.Account.Id) {
    await logger.info('Created new income account', {
      function_name: 'createDefaultIncomeAccount',
      account_id: result.Account.Id
    });
    return result.Account.Id;
  }

  throw new Error('Failed to create default income account');
}

serve(serve_handler);
