import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendInvoiceRequest {
  invoiceId: string;
  recipientEmail: string;
  leadId: string;
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

  try {
    const { invoiceId, recipientEmail, leadId }: SendInvoiceRequest = await req.json();
    
    // Validate required parameters
    if (!invoiceId) {
      throw new Error('Missing required parameter: invoiceId');
    }
    
    if (!recipientEmail || recipientEmail.trim() === '' || recipientEmail === 'undefined' || recipientEmail === 'null') {
      throw new Error('Missing or invalid recipient email address. Cannot send invoice without a valid email.');
    }
    
    if (!leadId) {
      throw new Error('Missing required parameter: leadId');
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail.trim())) {
      throw new Error(`Invalid email format: ${recipientEmail}`);
    }
    
    const cleanEmail = recipientEmail.trim();
    
    console.log(`Sending custom invoice email with payment link for ${invoiceId} to ${recipientEmail}`);

    // Fetch lead data to get the payment link and other details
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !leadData) {
      throw new Error(`Failed to fetch lead data for ID: ${leadId}. Error: ${leadError?.message}`);
    }

    const paymentLink = leadData.quickbooks_payment_link;
    const invoiceNumber = leadData.quickbooks_invoice_number || invoiceId;
    const amount = leadData.discount_rate_dr || leadData.standard_rate_sr;

    if (!paymentLink) {
      throw new Error('No QuickBooks payment link found for this lead. Please create the invoice first or check if the payment link was properly captured.');
    }

    console.log(`Found payment link for lead ${leadId}: ${paymentLink}`);

    // Construct custom HTML email with payment link (RESTORED ORIGINAL)
    const emailSubject = `Your Forte Athletics Invoice- #${invoiceNumber}`;
    const emailContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forte Athletics Invoice</title>
  <style>
    body {margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f8f8f8;color:#333; line-height: 1.6;}
    .email-container {max-width:600px;margin:0 auto;background-color:#fff;padding:20px;border-radius:8px; border: 1px solid #e0e0e0;}
    .content {font-size:16px;}
    .signature {margin-top:30px;padding-top:15px;border-top:1px solid #e0e0e0;font-size:14px;line-height:1.4;}
    .sig-images {margin-top:10px;text-align:left;}
    .sig-images img {display:block;margin-top:8px;}
    .headshot {width:60px;height:60px;border-radius:50%; margin-bottom: 5px;}
    .banner {width:200px;max-width:100%;height:auto;border-radius:4px;}
    .footer {margin-top:30px;font-size:12px;color:#777;text-align:center;}
    /* Mobile optimization */
    @media only screen and (max-width: 600px) {
      .email-container {width: 100% !important; border-radius: 0; padding: 10px;}
      .content {font-size: 15px;}
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="content">

      <p>Hi ${leadData.director_first_name},</p>

      <p>Your invoice from ForteAthletics is ready! You can view and pay it online using the secure link below:</p>

      <div style="background-color: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff;">
        <h3 style="color: #007bff; margin-top: 0;">💳 <strong>PAY INVOICE ONLINE</strong></h3>
        <p style="margin-bottom: 10px;"><a href="${paymentLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View & Pay Invoice</a></p>
      </div>

      <h4 style="color: #333; margin-bottom: 15px;">Invoice Details:</h4>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Invoice Number:</td>
          <td style="padding: 8px 0;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Amount:</td>
          <td style="padding: 8px 0;">${amount ? `$${amount}` : 'See invoice for details'}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold;">Program:</td>
          <td style="padding: 8px 0;">${leadData.workout_program_name || leadData.ensemble_program_name || 'LeadSense CRM Program'}</td>
        </tr>
      </table>

      <p>Simply click the "View & Pay Invoice" button above to:</p>
      <ul style="margin: 15px 0; padding-left: 20px;">
        <li>View your detailed invoice</li>
        <li>Make a secure online payment</li>
        <li>Pay by credit card, debit card, or bank transfer</li>
        <li>Receive instant payment confirmation</li>
      </ul>

      <p><strong>Payment is processed securely through QuickBooks</strong> - your information is protected with industry-standard encryption.</p>

      <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <p style="margin: 0;"><strong>Need help?</strong> If you have any questions about your invoice or need assistance with payment, please don't hesitate to reach out. We're here to help!</p>
      </div>

      <div class="signature">
        <p style="margin: 0 0 5px 0;">Best,</p>
        <p style="margin: 0;"><strong>Daniel Recoder</strong><br>Forte Athletics, Founder</p>
        <div class="sig-images">
          <img src="https://i.ibb.co.com/XrLf9zkW/Forte-Headshot.png" alt="Daniel Recoder" class="headshot">
          <img src="https://i.ibb.co.com/GQR3shCW/Community-Banner.jpg" alt="Forte Athletics" class="banner">
        </div>
      </div>
    </div>

    <div class="footer">
      <p style="margin: 0;">© Forte Athletics | <a href="www.tecnomaxx.com" target="_blank" style="color:#777;text-decoration:none;">By Tecnomaxx</a></p>
    </div>
  </div>
</body>
</html>`;

    // Send the custom email with payment link
    const emailSendResponse = await supabase.functions.invoke('send-email', {
      body: {
        to: cleanEmail,
        subject: emailSubject,
        content: emailContent,
        leadId: leadId,
        type: 'invoice_payment_link'
      }
    });

    if (emailSendResponse.error) {
      throw new Error(`Failed to send custom invoice email: ${emailSendResponse.error.message}`);
    }

    console.log(`Custom invoice email with payment link sent successfully to ${cleanEmail}`);

    // Update lead invoice status
    await supabase
      .from('leads')
      .update({
        invoice_status: 'sent_with_payment_link',
        last_communication_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    // Log communication
    await supabase
      .from('communication_history')
      .insert({
        lead_id: leadId,
        communication_type: 'invoice',
        direction: 'outbound',
        subject: emailSubject,
        content: `Custom invoice email with payment link sent to ${cleanEmail}. Payment link: ${paymentLink}`,
        sent_at: new Date().toISOString(),
        metadata: {
          quickbooks_invoice_id: invoiceId,
          quickbooks_payment_link: paymentLink,
          invoice_number: invoiceNumber,
          email_type: 'custom_invoice_with_payment_link'
        }
      });

    return new Response(JSON.stringify({
      success: true,
      invoiceId,
      paymentLink,
      emailSent: true,
      message: 'Custom invoice email with payment link sent successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in quickbooks-send-invoice function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};


serve(serve_handler);
