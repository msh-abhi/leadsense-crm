import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadSubmissionData {
  director_first_name: string;
  director_last_name: string;
  director_email: string;
  director_phone_number?: string;
  school_name?: string;
  ensemble_program_name?: string;
  workout_program_name?: string;
  estimated_performers?: number;
  season?: string;
  early_bird_deadline?: string;
  source?: string;
  [key: string]: any;
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const submissionData: LeadSubmissionData = await req.json();
    
    logger.info('Processing lead submission', {
      function_name: 'webhook-lead-ingestion',
      email: submissionData.director_email,
      source: submissionData.source || 'unknown'
    });

    // Validate required fields
    if (!submissionData.director_email || !submissionData.director_first_name || !submissionData.director_last_name) {
      throw new Error('Missing required fields: director_email, director_first_name, director_last_name');
    }

    // Perform upsert operation - update if exists by email, create if new
    const { data: existingLead, error: fetchError } = await supabase
      .from('leads')
      .select('*')
      .eq('director_email', submissionData.director_email)
      .maybeSingle();

    if (fetchError) {
      logger.error('Error fetching existing lead', {
        function_name: 'webhook-lead-ingestion',
        error_details: fetchError.message
      });
      throw fetchError;
    }

    let leadData;
    const currentTime = new Date().toISOString();

    if (existingLead) {
      // Update existing lead
      const { data, error } = await supabase
        .from('leads')
        .update({
          ...submissionData,
          raw_submission_data: submissionData,
          updated_at: currentTime,
        })
        .eq('id', existingLead.id)
        .select()
        .single();

      if (error) throw error;
      leadData = data;
      logger.info('Updated existing lead', {
        function_name: 'webhook-lead-ingestion',
        lead_id: leadData.id,
        action: 'updated'
      });
    } else {
      // Create new lead
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...submissionData,
          raw_submission_data: submissionData,
          status: 'New Lead',
          form_submission_date: currentTime,
          follow_up_count: 0,
          reply_detected: false,
        })
        .select()
        .single();

      if (error) throw error;
      leadData = data;
      logger.info('Created new lead', {
        function_name: 'webhook-lead-ingestion',
        lead_id: leadData.id,
        action: 'created'
      });
    }

    // Trigger AI quote generation process
    try {
      logger.info('Triggering AI quote generation for lead', {
        function_name: 'webhook-lead-ingestion',
        lead_id: leadData.id,
        action: existingLead ? 'updated' : 'created'
      });

      const aiResponse = await supabase.functions.invoke('ai-quote-generator', {
        body: { leadData }
      });

      if (aiResponse.error) {
        logger.error('AI quote generation failed', {
          function_name: 'webhook-lead-ingestion',
          lead_id: leadData.id,
          error_details: aiResponse.error
        });
        // Don't fail the webhook, just log the error
      } else {
        logger.info('AI quote generation triggered successfully', {
          function_name: 'webhook-lead-ingestion',
          lead_id: leadData.id
        });
      }
    } catch (error: any) {
      logger.error('Exception during AI quote generation trigger', {
        function_name: 'webhook-lead-ingestion',
        lead_id: leadData.id,
        error_details: error.message
      });
      // Don't fail the webhook, just log the error
    }

    return new Response(JSON.stringify({
      success: true,
      id: leadData.id,
      leadId: leadData.id,
      action: existingLead ? 'updated' : 'created',
      leadData: leadData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    logger.error('Error in webhook-lead-ingestion function', {
      function_name: 'webhook-lead-ingestion',
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

serve(serve_handler);