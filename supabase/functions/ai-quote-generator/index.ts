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

// Enhanced AI settings utilities
interface AISettings {
  enabled: boolean;
  primary_model_provider: string;
  fallback_openai_enabled: boolean;
  fallback_deepseek_claude_enabled: boolean;
}

interface ModelConfig {
  provider: string;
  model_id: string;
  name: string;
  apiKey: string;
}

async function getAISettings(functionName: string, leadId?: string): Promise<AISettings | null> {
  try {
    const { data: aiSettings, error } = await supabase
      .from('ai_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching AI settings', {
        function_name: functionName,
        lead_id: leadId,
        error_details: error.message
      });
      return null;
    }

    if (!aiSettings) {
      logger.warn('No AI settings found in database', {
        function_name: functionName,
        lead_id: leadId
      });
      return null;
    }

    return {
      enabled: aiSettings.enabled,
      primary_model_provider: aiSettings.primary_model_provider,
      fallback_openai_enabled: aiSettings.fallback_openai_enabled,
      fallback_deepseek_claude_enabled: aiSettings.fallback_deepseek_claude_enabled
    };
  } catch (error: any) {
    logger.error('Critical error fetching AI settings', {
      function_name: functionName,
      lead_id: leadId,
      error_details: error.message
    });
    return null;
  }
}

function buildModelPriority(aiSettings: AISettings): string[] {
  const modelPriority = [aiSettings.primary_model_provider];
  
  if (aiSettings.fallback_openai_enabled && !modelPriority.includes('OPENAI')) {
    modelPriority.push('OPENAI');
  }
  
  if (aiSettings.fallback_deepseek_claude_enabled) {
    if (!modelPriority.includes('DEEPSEEK')) modelPriority.push('DEEPSEEK');
    // Note: Claude removed since API key not available
  }
  
  return modelPriority;
}

function getModelConfig(provider: string): ModelConfig | null {
  const configs: Record<string, Omit<ModelConfig, 'apiKey'>> = {
    GEMINI: {
      provider: 'GEMINI',
      model_id: 'gemini-1.5-flash',
      name: 'Google Gemini Flash'
    },
    OPENAI: {
      provider: 'OPENAI',
      model_id: 'gpt-4o-mini',
      name: 'OpenAI GPT-4o Mini'
    },
    DEEPSEEK: {
      provider: 'DEEPSEEK',
      model_id: 'deepseek-chat',
      name: 'DeepSeek Chat'
    }
  };

  const config = configs[provider];
  if (!config) {
    logger.warn(`Unknown AI provider: ${provider}`, {
      function_name: 'getModelConfig',
      provider: provider,
      available_providers: Object.keys(configs)
    });
    return null;
  }

  const apiKeys: Record<string, string | undefined> = {
    GEMINI: Deno.env.get('GEMINI_API_KEY'),
    OPENAI: Deno.env.get('OPENAI_API_KEY'),
    DEEPSEEK: Deno.env.get('DEEPSEEK_API_KEY')
  };

  const apiKey = apiKeys[provider];
  if (!apiKey) {
    logger.warn(`No API key found for provider ${provider}`, {
      function_name: 'getModelConfig',
      provider: provider,
      env_var_name: `${provider}_API_KEY`
    });
    return null;
  }

  return {
    ...config,
    apiKey
  };
}

async function executeAICall(
  modelConfig: ModelConfig,
  prompt: string,
  functionName: string,
  leadId?: string,
  maxRetries = 5
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.info(`AI call attempt ${attempt + 1}/${maxRetries}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: modelConfig.provider,
        attempt: attempt + 1,
        model_id: modelConfig.model_id
      });

      // Progressive delay between attempts to avoid rate limits
      if (attempt > 0) {
        const baseDelay = 3000 * Math.pow(1.8, attempt - 1);
        const jitter = Math.random() * 1000;
        const delayMs = Math.min(baseDelay + jitter, 30000);
        
        logger.info(`Adding delay before attempt ${attempt + 1}`, {
          function_name: functionName,
          lead_id: leadId,
          delay_ms: Math.round(delayMs),
          provider: modelConfig.provider
        });
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      let response: Response;

      if (modelConfig.provider === 'GEMINI') {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.model_id}:generateContent?key=${modelConfig.apiKey}`;
        logger.debug(`Making Gemini API call to: ${apiUrl}`, {
          function_name: functionName,
          lead_id: leadId,
          model_id: modelConfig.model_id
        });

        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2000,
              topP: 0.8,
              topK: 40
            }
          }),
        });
      } else if (modelConfig.provider === 'OPENAI') {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelConfig.model_id,
            messages: [
              { role: 'system', content: 'You are an AI assistant for LeadSense CRM. Generate professional content and respond with valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 1500,
          }),
        });
      } else if (modelConfig.provider === 'DEEPSEEK') {
        response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelConfig.model_id,
            messages: [
              { role: 'system', content: 'You are an AI assistant for LeadSense CRM. Generate professional content and respond with valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 1500,
          }),
        });
      } else {
        throw new Error(`Provider ${modelConfig.provider} not implemented`);
      }

      // Enhanced error handling with detailed logging
      if (response.status === 429) {
        const errorText = await response.text();
        logger.warn(`Rate limit detected for ${modelConfig.provider} on attempt ${attempt + 1}`, {
          function_name: functionName,
          lead_id: leadId,
          provider: modelConfig.provider,
          attempt: attempt + 1,
          status_code: response.status,
          error_details: errorText,
          retry_after: response.headers.get('retry-after')
        });

        if (attempt < maxRetries - 1) {
          const retryAfter = response.headers.get('retry-after');
          const delayMs = retryAfter 
            ? Math.min(parseInt(retryAfter) * 1000, 60000)
            : Math.min(8000 * Math.pow(2, attempt), 60000);
          
          logger.info(`Waiting ${delayMs}ms before retry due to rate limit`, {
            function_name: functionName,
            lead_id: leadId,
            delay_ms: delayMs,
            provider: modelConfig.provider
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        } else {
          throw new Error(`Rate limit exceeded for ${modelConfig.provider} after ${maxRetries} attempts`);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`AI API call failed with status ${response.status}`, {
          function_name: functionName,
          lead_id: leadId,
          provider: modelConfig.provider,
          status_code: response.status,
          status_text: response.statusText,
          error_response: errorText,
          attempt: attempt + 1,
          api_url: modelConfig.provider === 'GEMINI' ? `https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.model_id}:generateContent` : 'N/A'
        });
        
        // Provide specific guidance for common errors
        if (response.status === 404 && modelConfig.provider === 'GEMINI') {
          throw new Error(`Gemini API returned 404 - this usually indicates an invalid API key or model ID. Please verify your GEMINI_API_KEY is correct and has proper permissions.`);
        } else if (response.status === 401) {
          throw new Error(`Authentication failed for ${modelConfig.provider} - please verify your API key is correct and active.`);
        } else if (response.status === 403) {
          throw new Error(`Access forbidden for ${modelConfig.provider} - your API key may not have the required permissions.`);
        }
        
        throw new Error(`AI API error (${modelConfig.provider}): ${response.status} ${response.statusText}. Details: ${errorText}`);
      }

      const data = await response.json();

      // Parse response based on provider with enhanced error handling
      let content: string;
      if (modelConfig.provider === 'GEMINI') {
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          logger.error('Invalid Gemini response structure', {
            function_name: functionName,
            lead_id: leadId,
            response_structure: JSON.stringify(data, null, 2),
            has_candidates: !!data.candidates,
            candidates_length: data.candidates?.length || 0
          });
          throw new Error('Invalid Gemini response structure - no text content found');
        }
        content = data.candidates[0].content.parts[0].text;
      } else if (modelConfig.provider === 'OPENAI') {
        if (!data.choices?.[0]?.message?.content) {
          logger.error('Invalid OpenAI response structure', {
            function_name: functionName,
            lead_id: leadId,
            response_structure: JSON.stringify(data, null, 2),
            has_choices: !!data.choices,
            choices_length: data.choices?.length || 0
          });
          throw new Error('Invalid OpenAI response structure - no message content found');
        }
        content = data.choices[0].message.content;
      } else if (modelConfig.provider === 'DEEPSEEK') {
        if (!data.choices?.[0]?.message?.content) {
          logger.error('Invalid DeepSeek response structure', {
            function_name: functionName,
            lead_id: leadId,
            response_structure: JSON.stringify(data, null, 2),
            has_choices: !!data.choices,
            choices_length: data.choices?.length || 0
          });
          throw new Error('Invalid DeepSeek response structure - no message content found');
        }
        content = data.choices[0].message.content;
      } else {
        throw new Error(`Response parsing not implemented for ${modelConfig.provider}`);
      }

      // Enhanced JSON parsing with better error handling
      let parsedResult;
      try {
        const cleanContent = content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
        parsedResult = JSON.parse(cleanContent);
        
        logger.debug('Successfully parsed AI response', {
          function_name: functionName,
          lead_id: leadId,
          provider: modelConfig.provider,
          content_length: content.length,
          clean_content_length: cleanContent.length
        });
      } catch (parseError: any) {
        logger.error('Failed to parse AI response as JSON', {
          function_name: functionName,
          lead_id: leadId,
          provider: modelConfig.provider,
          raw_content: content,
          clean_content: content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, ''),
          parse_error: parseError.message
        });
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }

      logger.info(`AI call successful for ${modelConfig.provider}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: modelConfig.provider,
        attempt: attempt + 1,
        response_keys: Object.keys(parsedResult)
      });

      return parsedResult;

    } catch (error: any) {
      lastError = error;
      
      logger.error(`AI call failed for ${modelConfig.provider} (attempt ${attempt + 1}/${maxRetries})`, {
        function_name: functionName,
        lead_id: leadId,
        provider: modelConfig.provider,
        attempt: attempt + 1,
        error_details: error.message,
        error_stack: error.stack
      });

      // If this is the last attempt, don't wait
      if (attempt === maxRetries - 1) {
        break;
      }

      // Wait before retrying (exponential backoff with jitter)
      const baseDelay = 3000 * Math.pow(2, attempt);
      const jitter = Math.random() * 1000;
      const delayMs = Math.min(baseDelay + jitter, 45000);
      
      logger.info(`Waiting ${Math.round(delayMs)}ms before retry`, {
        function_name: functionName,
        lead_id: leadId,
        provider: modelConfig.provider,
        delay_ms: Math.round(delayMs)
      });
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries failed
  logger.error(`All ${maxRetries} attempts failed for ${modelConfig.provider}`, {
    function_name: functionName,
    lead_id: leadId,
    provider: modelConfig.provider,
    final_error: lastError?.message,
    final_error_stack: lastError?.stack
  });
  throw lastError || new Error(`All ${maxRetries} attempts failed for ${modelConfig.provider}`);
}

async function executeAIWithTieredFallback(
  prompt: string,
  functionName: string,
  leadId?: string
): Promise<any> {
  logger.info('Starting tiered AI execution', {
    function_name: functionName,
    lead_id: leadId
  });

  // Get AI settings
  const aiSettings = await getAISettings(functionName, leadId);
  
  if (!aiSettings) {
    logger.error('AI settings not found in executeAIWithTieredFallback', {
      function_name: functionName,
      lead_id: leadId
    });
    throw new Error('AI settings not configured. Please configure AI settings in the Integration Hub.');
  }

  // Check master kill switch
  if (!aiSettings.enabled) {
    logger.info('AI is disabled via master kill switch in executeAIWithTieredFallback', {
      function_name: functionName,
      lead_id: leadId,
      ai_enabled: aiSettings.enabled
    });
    throw new Error('AI generation is currently disabled. Please enable AI in the Integration Hub.');
  }

  // Build prioritized model list
  const modelPriority = buildModelPriority(aiSettings);
  
  logger.info('AI is enabled, executing with model priority', {
    function_name: functionName,
    lead_id: leadId,
    model_priority: modelPriority,
    primary_provider: aiSettings.primary_model_provider,
    fallback_openai: aiSettings.fallback_openai_enabled,
    fallback_deepseek_claude: aiSettings.fallback_deepseek_claude_enabled
  });

  let lastError: Error | null = null;
  const attemptResults: Array<{provider: string, error: string, attempt: number}> = [];

  for (let i = 0; i < modelPriority.length; i++) {
    const provider = modelPriority[i];
    const modelConfig = getModelConfig(provider);
    
    if (!modelConfig) {
      const errorMsg = `No configuration or API key found for provider ${provider}`;
      logger.warn(errorMsg, {
        function_name: functionName,
        lead_id: leadId,
        provider: provider,
        available_env_vars: {
          gemini: !!Deno.env.get('GEMINI_API_KEY'),
          openai: !!Deno.env.get('OPENAI_API_KEY'),
          deepseek: !!Deno.env.get('DEEPSEEK_API_KEY')
        }
      });
      attemptResults.push({provider, error: errorMsg, attempt: i + 1});
      continue;
    }
    
    try {
      logger.info(`Attempting AI generation with ${provider} (attempt ${i + 1}/${modelPriority.length})`, {
        function_name: functionName,
        lead_id: leadId,
        provider: provider,
        attempt: i + 1,
        model_id: modelConfig.model_id
      });

      // Add delay between different model attempts to avoid cascading rate limits
      if (i > 0) {
        const modelSwitchDelay = 6000; // Increased from 3000ms
        logger.info(`Adding delay before switching to ${provider}`, {
          function_name: functionName,
          lead_id: leadId,
          delay_ms: modelSwitchDelay,
          switching_from: modelPriority[i-1],
          switching_to: provider
        });
        await new Promise(resolve => setTimeout(resolve, modelSwitchDelay));
      }

      const result = await executeAICall(modelConfig, prompt, functionName, leadId);
      
      logger.info(`AI generation successful with ${provider}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: provider,
        attempt: i + 1,
        total_attempts: i + 1,
        failed_attempts: attemptResults.length
      });

      return {
        ...result,
        providerUsed: provider,
        totalAttempts: i + 1,
        failedAttempts: attemptResults
      };

    } catch (error: any) {
      lastError = error;
      attemptResults.push({provider, error: error.message, attempt: i + 1});
      
      logger.error(`AI generation failed with ${provider}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: provider,
        attempt: i + 1,
        error_details: error.message,
        error_stack: error.stack,
        remaining_models: modelPriority.length - i - 1
      });

      // If this is the last model, don't wait
      if (i === modelPriority.length - 1) {
        break;
      }
    }
  }

  // All models failed - provide comprehensive error information
  logger.error('All AI models failed', {
    function_name: functionName,
    lead_id: leadId,
    models_tried: modelPriority,
    final_error: lastError?.message,
    final_error_stack: lastError?.stack,
    total_models_attempted: modelPriority.length,
    attempt_results: attemptResults
  });
  
  const errorSummary = attemptResults.map(r => `${r.provider}: ${r.error}`).join('; ');
  throw lastError || new Error(`All AI models failed. Attempts: ${errorSummary}`);
}

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

  let leadData: any = null;

  try {
    const { leadData: requestLeadData } = await req.json();
    leadData = requestLeadData;
    
    if (!leadData) {
      logger.error('Lead data is required', {
        function_name: 'ai-quote-generator'
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'Lead data is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('Starting AI quote generation', {
      function_name: 'ai-quote-generator',
      lead_id: leadData.id,
      recipient: `${leadData.director_first_name} ${leadData.director_last_name}`
    });

    // CRITICAL: Check AI settings and master kill switch FIRST
    const aiSettings = await getAISettings('ai-quote-generator', leadData.id);
    
    if (!aiSettings) {
      logger.error('No AI settings found in database - AI functionality disabled', {
        function_name: 'ai-quote-generator',
        lead_id: leadData.id
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'AI settings not configured. Please configure AI settings in the Integration Hub.',
        errorType: 'ai_settings_missing'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check master kill switch
    if (!aiSettings.enabled) {
      logger.info('AI is disabled via master kill switch - stopping quote generation completely', {
        function_name: 'ai-quote-generator',
        lead_id: leadData.id,
        ai_enabled: aiSettings.enabled
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'AI generation is currently disabled. Please enable AI in the Integration Hub to generate quotes.',
        errorType: 'ai_disabled',
        aiDisabled: true
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('AI is enabled, proceeding with quote generation', {
      function_name: 'ai-quote-generator',
      lead_id: leadData.id,
      ai_enabled: aiSettings.enabled,
      primary_provider: aiSettings.primary_model_provider
    });

    // Generate quote using the dynamic pricing logic (no AI needed for pricing)
    const quoteResult = await generateQuoteWithDynamicPricing(leadData);
    
    logger.info('Quote generated with dynamic pricing', {
      function_name: 'ai-quote-generator',
      lead_id: leadData.id,
      standard_rate: quoteResult.standardRate,
      discount_rate: quoteResult.discountRate,
      savings: quoteResult.savings,
      early_bird_applicable: quoteResult.isEarlyBirdApplicable
    });

    // Update lead with quote information
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        status: 'Quote Sent',
        quote_sent_date: new Date().toISOString(),
        last_communication_date: new Date().toISOString(),
        standard_rate_sr: quoteResult.standardRate,
        discount_rate_dr: quoteResult.discountRate,
        savings: quoteResult.savings,
        early_bird_deadline: quoteResult.earlyBirdDeadline,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadData.id);

    if (updateError) {
      logger.error('Failed to update lead with quote information', {
        function_name: 'ai-quote-generator',
        lead_id: leadData.id,
        error_details: updateError.message
      });
      throw updateError;
    }

    // Send email and SMS
    const emailResponse = await supabase.functions.invoke('send-email', {
      body: {
        to: leadData.director_email,
        subject: quoteResult.emailSubject,
        content: quoteResult.emailContent,
        leadId: leadData.id,
        type: 'quote'
      }
    });

    let smsResponse = { error: null };
    if (leadData.director_phone_number) {
      smsResponse = await supabase.functions.invoke('send-sms', {
        body: {
          to: leadData.director_phone_number,
          message: quoteResult.smsContent,
          leadId: leadData.id,
          type: 'quote_notification'
        }
      });
    }

    // Log communication
    await supabase
      .from('communication_history')
      .insert([
        {
          lead_id: leadData.id,
          communication_type: 'email',
          direction: 'outbound',
          subject: quoteResult.emailSubject,
          content: quoteResult.emailContent,
          sent_at: new Date().toISOString(),
          metadata: {
            quote_type: 'automated',
            standard_rate: quoteResult.standardRate,
            discount_rate: quoteResult.discountRate,
            savings: quoteResult.savings,
            early_bird_applicable: quoteResult.isEarlyBirdApplicable,
            early_bird_deadline: quoteResult.earlyBirdDeadline
          }
        },
        ...(leadData.director_phone_number ? [{
          lead_id: leadData.id,
          communication_type: 'sms',
          direction: 'outbound',
          content: quoteResult.smsContent,
          sent_at: new Date().toISOString(),
          metadata: {
            quote_type: 'automated',
            early_bird_applicable: quoteResult.isEarlyBirdApplicable
          }
        }] : [])
      ]);

    logger.info('Quote generation completed successfully', {
      function_name: 'ai-quote-generator',
      lead_id: leadData.id,
      email_sent: !emailResponse.error,
      sms_sent: !smsResponse.error,
      standard_rate: quoteResult.standardRate,
      discount_rate: quoteResult.discountRate,
      savings: quoteResult.savings
    });

    return new Response(JSON.stringify({
      success: true,
      leadId: leadData.id,
      quote: quoteResult,
      emailSent: !emailResponse.error,
      smsSent: !smsResponse.error,
      message: 'Quote generated and sent successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    logger.error('Critical error in ai-quote-generator function', {
      function_name: 'ai-quote-generator',
      lead_id: leadData?.id,
      error_details: error.message,
      stack: error.stack
    });
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      errorType: 'function_error',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

async function generateQuoteWithDynamicPricing(leadData: any): Promise<any> {
  logger.info('Starting dynamic pricing calculation', {
    function_name: 'generateQuoteWithDynamicPricing',
    lead_id: leadData.id,
    estimated_performers: leadData.estimated_performers
  });

  // Get submission date - use form_submission_date if available, otherwise created_at
  const submissionDateString = leadData.form_submission_date || leadData.created_at;
  const submissionDate = new Date(submissionDateString);
  
  // Calculate early bird deadline: submission date + 28 days (in UTC)
  const earlyBirdDeadline = new Date(submissionDate);
  earlyBirdDeadline.setUTCDate(earlyBirdDeadline.getUTCDate() + 28);
  
  // Get current date in UTC for comparison
  const currentDate = new Date();
  
  // Check if early bird discount is still applicable
  const isEarlyBirdApplicable = currentDate <= earlyBirdDeadline;
  
  logger.debug('Date calculations', {
    function_name: 'generateQuoteWithDynamicPricing',
    lead_id: leadData.id,
    submission_date: submissionDate.toISOString(),
    early_bird_deadline: earlyBirdDeadline.toISOString(),
    current_date: currentDate.toISOString(),
    is_early_bird_applicable: isEarlyBirdApplicable
  });

  // Calculate DR_total using the provided formulas
  const n = leadData.estimated_performers || 50; // Default to 50 if not provided
  let drTotal: number;
  
  if (n <= 35) {
    drTotal = 350;
  } else if (n >= 36 && n <= 50) {
    drTotal = 350 + 6.6667 * (n - 35);
  } else if (n >= 51 && n <= 80) {
    drTotal = 450 + 10 * (n - 50);
  } else if (n >= 81 && n <= 300) {
    drTotal = 750 + 3.4091 * (n - 80);
  } else { // n > 300
    drTotal = 1500 + 5 * (n - 300);
  }
  
  // Round DR_total to nearest 10
  const discountRate = Math.round(drTotal / 10) * 10;
  
  // Calculate SR_total = ROUND(DR_total × 1.25, -1)
  const standardRate = Math.round((discountRate * 1.25) / 10) * 10;
  
  // Determine final rates based on early bird applicability
  const finalDiscountRate = isEarlyBirdApplicable ? discountRate : standardRate;
  const savings = isEarlyBirdApplicable ? standardRate - discountRate : 0;
  
  logger.debug('Pricing calculations completed', {
    function_name: 'generateQuoteWithDynamicPricing',
    lead_id: leadData.id,
    estimated_performers: n,
    dr_total_raw: drTotal,
    dr_total_rounded: discountRate,
    sr_total: standardRate,
    is_early_bird_applicable: isEarlyBirdApplicable,
    final_discount_rate: finalDiscountRate,
    savings: savings
  });

  // Use the exact templates provided
  const programName = leadData.workout_program_name || leadData.ensemble_program_name || 'Training App / In-Person Clinic';
  const firstName = leadData.director_first_name || 'there';
  
  // Format deadline for display in PST timezone
  const deadline = earlyBirdDeadline.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/Los_Angeles' // PST timezone
  });
  
  const emailSubject = `Marching Band Boot Camp—${programName}`;
  
  // Generate HTML email content based on early bird applicability (RESTORED ORIGINAL)
  const emailContent = isEarlyBirdApplicable ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forte Athletics Quote</title>
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

      <p>Hi ${firstName},</p>

      <p>Daniel Recoder here—excited to help your students show up strong and ready for band camp!</p>

      <div style="background-color: #f8f8f8; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #0073e6;">
        <p style="font-weight: bold; margin-top: 0; color: #0073e6;">Early‑bird offer for Marching Band Boot Camp:</p>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="margin-bottom: 5px;">Standard: <strong>$${standardRate}</strong></li>
          <li style="margin-bottom: 5px;">Early‑bird (before ${deadline}): <strong>$${finalDiscountRate}</strong></li>
          <li style="margin-bottom: 0;">Savings: <strong>$${savings}</strong></li>
        </ul>
      </div>

      <p>Next step: reply "Lock it in" and I'll send the invoice.</p>

      <p>
        <a href="https://drive.google.com/file/d/1PSkd9GUew1aatYdcXfbwqToBvZGeGkfm/view" target="_blank" style="color:#0073e6;text-decoration:none; font-weight: bold;">Click Here for the Info sheet</a>
      </p>

      <p>P.S. Thinking about an on‑site clinic too? It's priced separately—share a few basics here so I can scope it, <a href="https://docs.google.com/forms/d/e/1FAIpQLSdpk6uSm0TZOQ0VitPlWHYmcK4sA6MdS5DgC-qA2AdQS430VA/viewform?usp=dialog" target="_blank" style="color:#0073e6;text-decoration:none; font-weight: bold;">Click here for the clinic form</a>.</p>


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
</html>` : `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Forte Athletics Quote</title>
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

      <p>Hi ${firstName},</p>

      <p>Daniel Recoder here—excited to help your students show up strong and ready for band camp!</p>

      <div style="background-color: #f8f8f8; padding: 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #0073e6;">
        <p style="font-weight: bold; margin-top: 0; color: #0073e6;">Marching Band Boot Camp pricing:</p>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="margin-bottom: 5px;">Rate: <strong>$${standardRate}</strong></li>
        </ul>
      </div>

      <p>Next step: reply "Lock it in" and I'll send the invoice.</p>

      <p>
        <a href="https://drive.google.com/file/d/1PSkd9GUew1aatYdcXfbwqToBvZGeGkfm/view" target="_blank" style="color:#0073e6;text-decoration:none; font-weight: bold;">Click Here for the Info sheet</a>
      </p>

      <p>P.S. Thinking about an on‑site clinic too? It's priced separately—share a few basics here so I can scope it, <a href="https://docs.google.com/forms/d/e/1FAIpQLSdpk6uSm0TZOQ0VitPlWHYmcK4sA6MdS5DgC-qA2AdQS430VA/viewform?usp=dialog" target="_blank" style="color:#0073e6;text-decoration:none; font-weight: bold;">Click here for the clinic form</a>.</p>


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

  const smsContent = isEarlyBirdApplicable 
    ? `Hi ${firstName}! Forte Athletics Team here. We're happy to see you're interested in building a stronger band at ${programName}. 💪 Your early bird rate is $${finalDiscountRate} thru ${deadline}. Reply "lock it in," and we'll send over the invoice. We're happy to answer any questions you have! 😄`
    : `Hi ${firstName}! Forte Athletics Team here. We're happy to see you're interested in building a stronger band at ${programName}. 💪 Your rate is $${standardRate}. Reply "lock it in," and we'll send over the invoice. We're happy to answer any questions you have! 😄`;

  logger.info('Quote content generated', {
    function_name: 'generateQuoteWithDynamicPricing',
    lead_id: leadData.id,
    email_subject: emailSubject,
    email_content_length: emailContent.length,
    sms_content_length: smsContent.length,
    final_pricing: {
      standard_rate: standardRate,
      discount_rate: finalDiscountRate,
      savings: savings,
      early_bird_applicable: isEarlyBirdApplicable
    }
  });

  return {
    emailSubject,
    emailContent,
    smsContent,
    standardRate,
    discountRate: finalDiscountRate,
    savings,
    earlyBirdDeadline: earlyBirdDeadline.toISOString(),
    isEarlyBirdApplicable
  };
}

serve(serve_handler);