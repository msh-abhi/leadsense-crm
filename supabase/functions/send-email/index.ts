import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.53.0');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  subject: string;
  content: string;
  type: 'follow_up' | 'quote' | 'custom' | 'invoice_payment_link';
  leadId?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let leadId: string | undefined;

  try {
    const { to, subject, content, type, leadId: requestLeadId }: EmailRequest = await req.json();
    leadId = requestLeadId;

    if (!to || !subject || !content) {
      throw new Error("Missing required fields: to, subject, content");
    }

    logger.info('Sending email', {
      function_name: 'send-email',
      lead_id: leadId,
      email_type: type,
      recipient: to
    });

    // Configure sender name from environment variable
    const baseFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@leadsense.com";
    const senderName = Deno.env.get("RESEND_FROM_NAME") || "LeadSense CRM";

    const fromEmail = `${senderName} <${baseFromEmail}>`;

    // Check if Resend API key is configured
    if (!Deno.env.get("RESEND_API_KEY")) {
      logger.error('RESEND_API_KEY environment variable not configured', {
        function_name: 'send-email',
        lead_id: leadId,
        recipient: to
      });
      throw new Error('Email service not configured. Please set RESEND_API_KEY environment variable.');
    }

    logger.debug('Resend configuration check passed', {
      function_name: 'send-email',
      lead_id: leadId,
      has_api_key: !!Deno.env.get("RESEND_API_KEY"),
      from_email: fromEmail,
      api_key_prefix: (Deno.env.get("RESEND_API_KEY") || '').substring(0, 8) + '...',
      recipient_domain: to.split('@')[1],
      sender_name: senderName
    });

    // Validate recipient email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      logger.error('Invalid recipient email format', {
        function_name: 'send-email',
        lead_id: leadId,
        recipient: to,
        email_format_valid: false
      });
      throw new Error(`Invalid email format: ${to}`);
    }

    // Check if from email is properly formatted
    if (!fromEmail.includes('@')) {
      logger.error('Invalid from email format', {
        function_name: 'send-email',
        lead_id: leadId,
        from_email: fromEmail,
        format_valid: false
      });
      throw new Error(`Invalid from email format: ${fromEmail}`);
    }

    let emailResponse;
    try {
      // Check if content is already HTML formatted (contains HTML tags)
      const isHtmlContent = /<\/?[a-z][\s\S]*>/i.test(content);

      let finalHtmlContent;

      if (isHtmlContent) {
        // Content is already HTML - use it directly but wrap in email template
        finalHtmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              ${content}
            </div>
          </div>
        `;
      } else {
        // Content is plain text - wrap in standard HTML template
        finalHtmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <h2 style="color: #333; margin-bottom: 20px;">${subject}</h2>
              <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
                ${content.replace(/\n/g, '<br>')}
              </div>
              <div style="text-align: center; color: #666; font-size: 14px;">
                <p>Best regards,<br>LeadSense CRM Team</p>
              </div>
            </div>
          </div>
        `;
      }

      emailResponse = await resend.emails.send({
        from: fromEmail,
        to: [to],
        subject: subject,
        html: finalHtmlContent,
      });

      // Validate the response structure
      if (!emailResponse || !emailResponse.data) {
        logger.error('Invalid response from Resend API - no data field', {
          function_name: 'send-email',
          lead_id: leadId,
          response: JSON.stringify(emailResponse),
          recipient: to
        });
        throw new Error('Invalid response from email service');
      }

      if (!emailResponse.data.id) {
        logger.error('Resend API response missing message ID', {
          function_name: 'send-email',
          lead_id: leadId,
          response_data: JSON.stringify(emailResponse.data),
          recipient: to
        });
        throw new Error('Email service response missing message ID');
      }

      logger.info('Email sent successfully via Resend', {
        function_name: 'send-email',
        lead_id: leadId,
        message_id: emailResponse.data.id,
        recipient: to,
        from_email: fromEmail,
        response_status: 'success'
      });

      // Log additional response details for debugging
      logger.debug('Resend API response details', {
        function_name: 'send-email',
        lead_id: leadId,
        message_id: emailResponse.data.id,
        response_keys: Object.keys(emailResponse.data),
        has_error: !!emailResponse.error,
        recipient: to
      });

    } catch (resendError: any) {
      logger.error('Resend API call failed', {
        function_name: 'send-email',
        lead_id: leadId || 'unknown',
        error_details: resendError.message,
        error_name: resendError.name,
        error_status: resendError.status,
        error_response: resendError.response?.data,
        stack: resendError.stack,
        recipient: to,
        from_email: fromEmail,
        sender_name: senderName
      });
      throw new Error(`Email sending failed: ${resendError.message}`);
    }

    // If leadId is provided, we could log this communication to the database
    if (leadId) {
      logger.info('Email communication logged', {
        function_name: 'send-email',
        lead_id: leadId
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: emailResponse.data?.id 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    const currentLeadId = leadId || 'unknown';
    logger.error('Error in send-email function', {
      function_name: 'send-email',
      lead_id: currentLeadId,
      error_details: error.message,
      stack: error.stack
    });
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
