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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logger.info('Follow-up automation function started', {
      function_name: 'follow-up-automation',
      execution_time: new Date().toISOString()
    });

    // Find leads that need follow-up
    // Criteria: Quote sent, no reply detected, last communication > 4 days ago, follow_up_count < 4
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    logger.info('Calculated cutoff date for follow-up automation', {
      function_name: 'follow-up-automation',
      four_days_ago: fourDaysAgo.toISOString(),
      current_time: new Date().toISOString()
    });

    // First, let's check for any leads that should have been processed recently
    const { data: recentLeads, error: recentError } = await supabase
      .from('leads')
      .select('*')
      .in('status', ['Quote Sent', 'Follow-up Sent 1', 'Follow-up Sent 2', 'Follow-up Sent 3'])
      .order('last_communication_date', { ascending: false })
      .limit(10);

    if (recentError) {
      logger.warn('Error fetching recent leads for debugging', {
        function_name: 'follow-up-automation',
        error_details: recentError.message
      });
    } else {
      logger.info('Recent leads for debugging', {
        function_name: 'follow-up-automation',
        recent_leads_count: recentLeads?.length || 0,
        sample_leads: recentLeads?.slice(0, 3).map(l => ({
          id: l.id,
          status: l.status,
          last_communication_date: l.last_communication_date,
          follow_up_count: l.follow_up_count,
          reply_detected: l.reply_detected
        }))
      });
    }

    const { data: leadsNeedingFollowUp, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('reply_detected', false)
      .in('status', ['Quote Sent', 'Follow-up Sent 1', 'Follow-up Sent 2', 'Follow-up Sent 3'])
      .lt('last_communication_date', fourDaysAgo.toISOString())
      .lt('follow_up_count', 4);

    if (leadsError) throw leadsError;

    logger.info('Query completed for leads needing follow-up', {
      function_name: 'follow-up-automation',
      leads_found: leadsNeedingFollowUp?.length || 0,
      query_criteria: {
        reply_detected: false,
        status_in: ['Quote Sent', 'Follow-up Sent 1', 'Follow-up Sent 2', 'Follow-up Sent 3'],
        last_communication_before: fourDaysAgo.toISOString(),
        follow_up_count_less_than: 4
      }
    });

    // Log details of each lead found (for debugging)
    if (leadsNeedingFollowUp && leadsNeedingFollowUp.length > 0) {
      for (const lead of leadsNeedingFollowUp) {
        logger.debug('Lead identified for follow-up', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          director_email: lead.director_email,
          director_name: `${lead.director_first_name} ${lead.director_last_name}`,
          status: lead.status,
          reply_detected: lead.reply_detected,
          last_communication_date: lead.last_communication_date,
          follow_up_count: lead.follow_up_count,
          form_submission_date: lead.form_submission_date,
          quote_sent_date: lead.quote_sent_date
        });
      }
    } else {
      logger.info('No leads found matching follow-up criteria', {
        function_name: 'follow-up-automation'
      });
    }

    const results = [];

    for (const lead of leadsNeedingFollowUp || []) {
      try {
        logger.info('Starting follow-up processing for lead', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          director_email: lead.director_email,
          current_status: lead.status,
          current_follow_up_count: lead.follow_up_count
        });

        const nextFollowUpNumber = lead.follow_up_count + 1;
        
        logger.debug('Calculated next follow-up number', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          next_follow_up_number: nextFollowUpNumber
        });
        
        // Get follow-up template
        const { data: template, error: templateError } = await supabase
          .from('follow_up_templates')
          .select('*')
          .eq('sequence_number', nextFollowUpNumber)
          .eq('is_active', true)
          .single();

        if (templateError || !template) {
          logger.error('No follow-up template found', {
            function_name: 'follow-up-automation',
            lead_id: lead.id,
            sequence_number: nextFollowUpNumber,
            template_error: templateError?.message,
            has_template: !!template
          });
          continue;
        }

        logger.info('Follow-up template found', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          template_id: template.id,
          template_name: template.name,
          sequence_number: template.sequence_number
        });

        // Personalize template content
        const personalizedEmailSubject = personalizeContent(template.email_subject, lead);
        const personalizedEmailBody = personalizeContent(template.email_body, lead);
        const personalizedSmsMessage = personalizeContent(template.sms_message, lead);

        logger.debug('Template content personalized', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          email_subject: personalizedEmailSubject,
          email_body_length: personalizedEmailBody.length,
          sms_message_length: personalizedSmsMessage.length
        });

        // Send email
        logger.info('Attempting to send follow-up email', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          recipient: lead.director_email,
          subject: personalizedEmailSubject
        });

        let emailResponse;
        try {
          emailResponse = await supabase.functions.invoke('send-email', {
            body: {
              to: lead.director_email,
              subject: personalizedEmailSubject,
              content: personalizedEmailBody,
              leadId: lead.id,
              type: `follow_up_${nextFollowUpNumber}`
            }
          });

          logger.info('Email send response received', {
            function_name: 'follow-up-automation',
            lead_id: lead.id,
            email_success: !emailResponse.error,
            email_error: emailResponse.error?.message,
            response_data: emailResponse.data
          });

          if (emailResponse.error) {
            logger.error('Email sending failed', {
              function_name: 'follow-up-automation',
              lead_id: lead.id,
              error_details: emailResponse.error.message,
              error_code: emailResponse.error.code,
              error_status: emailResponse.error.status
            });
          }
        } catch (emailError: any) {
          logger.error('Exception during email sending', {
            function_name: 'follow-up-automation',
            lead_id: lead.id,
            error_details: emailError.message,
            stack: emailError.stack
          });
          emailResponse = { error: emailError };
        }

        // Send SMS
        let smsResponse = { error: null };
        if (lead.director_phone_number) {
          logger.info('Attempting to send follow-up SMS', {
            function_name: 'follow-up-automation',
            lead_id: lead.id,
            phone_number: lead.director_phone_number,
            message_length: personalizedSmsMessage.length
          });
          
          smsResponse = await supabase.functions.invoke('send-sms', {
            body: {
              to: lead.director_phone_number,
              message: personalizedSmsMessage,
              leadId: lead.id,
              type: `follow_up_${nextFollowUpNumber}_sms`
            }
          });
          
          logger.info('SMS send response received', {
            function_name: 'follow-up-automation',
            lead_id: lead.id,
            sms_success: !smsResponse.error,
            sms_error: smsResponse.error?.message
          });
        } else {
          logger.info('No phone number available, skipping SMS', {
            function_name: 'follow-up-automation',
            lead_id: lead.id
          });
        }

        // Update lead status and follow-up count
        const newStatus = `Follow-up Sent ${nextFollowUpNumber}`;
        
        logger.info('Updating lead status and follow-up count', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          old_status: lead.status,
          new_status: newStatus,
          old_follow_up_count: lead.follow_up_count,
          new_follow_up_count: nextFollowUpNumber
        });
        
        const { error: updateError } = await supabase
          .from('leads')
          .update({
            status: newStatus,
            follow_up_count: nextFollowUpNumber,
            last_communication_date: new Date().toISOString(),
            last_email_sent_type: `follow_up_${nextFollowUpNumber}`,
            last_sms_sent_type: `follow_up_${nextFollowUpNumber}_sms`
          })
          .eq('id', lead.id);

        if (updateError) throw updateError;

        logger.info('Lead update completed successfully', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          final_status: newStatus,
          final_follow_up_count: nextFollowUpNumber
        });

        results.push({
          leadId: lead.id,
          email: lead.director_email,
          followUpNumber: nextFollowUpNumber,
          emailSent: !emailResponse.error,
          smsSent: !smsResponse.error,
          newStatus
        });

        logger.info('Follow-up processing completed for lead', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          director_email: lead.director_email,
          follow_up_number: nextFollowUpNumber,
          email_sent: !emailResponse.error,
          sms_sent: !smsResponse.error
        });

      } catch (error) {
        logger.error('Error processing follow-up for lead', {
          function_name: 'follow-up-automation',
          lead_id: lead.id,
          error_details: error.message,
          stack: error.stack
        });
        
        results.push({
          leadId: lead.id,
          email: lead.director_email,
          error: error.message
        });
      }
    }

    logger.info('Follow-up automation completed', {
      function_name: 'follow-up-automation',
      total_processed: results.length,
      successful_results: results.filter(r => !r.error).length,
      failed_results: results.filter(r => r.error).length,
      execution_time: new Date().toISOString()
    });

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    logger.error('Critical error in follow-up-automation function', {
      function_name: 'follow-up-automation',
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

function personalizeContent(template: string, lead: any): string {
  logger.debug('Personalizing template content', {
    function_name: 'personalizeContent',
    lead_id: lead.id,
    template_length: template.length,
    available_fields: {
      director_first_name: !!lead.director_first_name,
      director_last_name: !!lead.director_last_name,
      school_name: !!lead.school_name,
      ensemble_program_name: !!lead.ensemble_program_name,
      workout_program_name: !!lead.workout_program_name,
      estimated_performers: !!lead.estimated_performers,
      discount_rate_dr: !!lead.discount_rate_dr,
      standard_rate_sr: !!lead.standard_rate_sr,
      savings: !!lead.savings
    }
  });
  
  return template
    .replace(/{director_first_name}/g, lead.director_first_name || 'there')
    .replace(/{director_last_name}/g, lead.director_last_name || '')
    .replace(/{workout_program_name}/g, lead.workout_program_name || lead.ensemble_program_name || 'our program')
    .replace(/{school_name}/g, lead.school_name || 'your organization')
    .replace(/{estimated_performers}/g, lead.estimated_performers || 'your group')
    .replace(/{ensemble_program_name}/g, lead.ensemble_program_name || 'your ensemble program')
    .replace(/{director_email}/g, lead.director_email || '')
    .replace(/{director_phone_number}/g, lead.director_phone_number || '')
    .replace(/{discount_rate_dr}/g, lead.discount_rate_dr ? `$${lead.discount_rate_dr}` : '$0')
    .replace(/{standard_rate_sr}/g, lead.standard_rate_sr ? `$${lead.standard_rate_sr}` : '$0')
    .replace(/{savings}/g, lead.savings ? `$${lead.savings}` : '$0')
    .replace(/{early_bird_deadline}/g, lead.early_bird_deadline || 'soon')
    .replace(/{season}/g, lead.season || 'this season')
    .replace(/{quickbooks_customer_id}/g, lead.quickbooks_customer_id || 'N/A')
    .replace(/{quickbooks_invoice_id}/g, lead.quickbooks_invoice_id || 'N/A')
    .replace(/{quickbooks_invoice_number}/g, lead.quickbooks_invoice_number || 'N/A')
    .replace(/{payment_status}/g, lead.invoice_status || 'pending')
    .replace(/{status}/g, lead.status || 'New Lead')
    .replace(/{form_submission_date}/g, lead.form_submission_date ? new Date(lead.form_submission_date).toLocaleDateString() : 'recently');
}

serve(serve_handler);
