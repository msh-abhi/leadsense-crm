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
    // Note: Claude removed since you don't have API key
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
        const delayMs = Math.min(3000 * Math.pow(1.8, attempt - 1), 30000);
        logger.info(`Adding delay before attempt ${attempt + 1}`, {
          function_name: functionName,
          lead_id: leadId,
          delay_ms: delayMs,
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
              { role: 'system', content: 'You are an AI assistant for LeadSense CRM by Tecnomaxx Digital LTD. Generate professional content and respond with valid JSON only.' },
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
              { role: 'system', content: 'You are an AI assistant for a music education services company. Generate professional content and respond with valid JSON only.' },
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
          // Use retry-after header if available, otherwise exponential backoff
          const retryAfter = response.headers.get('retry-after');
          const delayMs = retryAfter 
            ? Math.min(parseInt(retryAfter) * 1000, 60000)
            : Math.min(5000 * Math.pow(2, attempt), 60000);
          
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
        
        // For 404 errors on Gemini, provide specific guidance
        if (response.status === 404 && modelConfig.provider === 'GEMINI') {
          throw new Error(`Gemini API returned 404 - this usually indicates an invalid API key or model ID. Please verify your GEMINI_API_KEY is correct and has proper permissions.`);
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
      const jitter = Math.random() * 1000; // Add randomness to avoid thundering herd
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
        const modelSwitchDelay = 5000; // Increased from 3000ms
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

interface ReplyAnalysisRequest {
  leadEmail: string;
  replyContent: string;
  replySubject?: string;
  replyTimestamp?: string;
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadEmail, replyContent, replySubject, replyTimestamp }: ReplyAnalysisRequest = await req.json();
    
    logger.info('Analyzing reply from email', {
      function_name: 'reply-detection',
      email: leadEmail,
      has_subject: !!replySubject,
      reply_content_length: replyContent?.length || 0
    });

    // Find the lead by email
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('director_email', leadEmail)
      .maybeSingle();

    if (leadError) throw leadError;
    
    if (!lead) {
      logger.warn('No lead found for email', {
        function_name: 'reply-detection',
        email: leadEmail
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'Lead not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // CRITICAL: Log the incoming communication FIRST, before any AI analysis
    logger.info('Logging incoming communication', {
      function_name: 'reply-detection',
      lead_id: lead.id,
      communication_type: 'email_reply'
    });

    const communicationTimestamp = replyTimestamp || new Date().toISOString();

    // Insert communication history record
    const { error: commHistoryError } = await supabase
      .from('communication_history')
      .insert({
        lead_id: lead.id,
        communication_type: 'email',
        direction: 'inbound',
        subject: replySubject || 'Reply from customer',
        content: replyContent,
        sent_at: communicationTimestamp,
        metadata: {
          reply_type: 'customer_response',
          original_email: leadEmail
        }
      });

    if (commHistoryError) {
      logger.error('Failed to log communication history', {
        function_name: 'reply-detection',
        lead_id: lead.id,
        error_details: commHistoryError.message
      });
    } else {
      logger.info('Communication history logged successfully', {
        function_name: 'reply-detection',
        lead_id: lead.id
      });
    }

    // Update lead to mark reply as detected and store reply content
    const { error: leadUpdateError } = await supabase
      .from('leads')
      .update({
        reply_detected: true,
        last_reply_content: replyContent,
        last_communication_date: communicationTimestamp,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    if (leadUpdateError) {
      logger.error('Failed to update lead with reply info', {
        function_name: 'reply-detection',
        lead_id: lead.id,
        error_details: leadUpdateError.message
      });
    } else {
      logger.info('Lead updated with reply information', {
        function_name: 'reply-detection',
        lead_id: lead.id
      });
    }

    // Enhanced keyword-based fallback analysis BEFORE AI
    const keywordAnalysis = performEnhancedKeywordAnalysis(replyContent, lead);
    
    logger.info('Enhanced keyword analysis completed', {
      function_name: 'reply-detection',
      lead_id: lead.id,
      keyword_purchase_intent: keywordAnalysis.purchaseIntent,
      keyword_intent_type: keywordAnalysis.intentType,
      detected_keywords: keywordAnalysis.detectedKeywords,
      confidence: keywordAnalysis.confidence
    });

    // If keyword analysis shows high-confidence purchase intent, proceed directly
    if (keywordAnalysis.purchaseIntent && keywordAnalysis.confidence >= 0.9) {
      logger.info('High-confidence purchase intent detected via keywords, proceeding with conversion', {
        function_name: 'reply-detection',
        lead_id: lead.id,
        intent_type: keywordAnalysis.intentType,
        confidence: keywordAnalysis.confidence,
        detected_phrases: keywordAnalysis.detectedKeywords
      });

      // Proceed with QuickBooks conversion
      await processDirectConversion(lead, keywordAnalysis);
      
      return new Response(JSON.stringify({
        success: true,
        leadId: lead.id,
        purchaseIntent: true,
        intentType: 'ready_to_purchase',
        primaryConcern: keywordAnalysis.primaryConcern,
        confidence: keywordAnalysis.confidence,
        communicationLogged: true,
        analysisMethod: 'enhanced_keyword_analysis',
        conversionTriggered: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try AI analysis for more nuanced cases
    let analysisResult;
    try {
      analysisResult = await analyzeReplyContentWithTieredAI(replyContent, lead);
      
      logger.info('AI analysis completed successfully', {
        function_name: 'reply-detection',
        lead_id: lead.id,
        ai_purchase_intent: analysisResult.purchaseIntent,
        ai_intent_type: analysisResult.intentType,
        ai_confidence: analysisResult.confidence,
        provider_used: analysisResult.providerUsed
      });
    } catch (aiError: any) {
      logger.error('AI analysis failed, using enhanced keyword analysis as fallback', {
        function_name: 'reply-detection',
        lead_id: lead.id,
        ai_error: aiError.message,
        fallback_to_keywords: true
      });
      
      // Use enhanced keyword analysis as fallback
      analysisResult = {
        ...keywordAnalysis,
        primaryConcern: `AI analysis failed (${aiError.message}). Using enhanced keyword analysis.`,
        aiError: true,
        errorMessage: aiError.message,
        errorType: 'ai_service_failure'
      };
    }

    // Process based on analysis result
    if (analysisResult.purchaseIntent && analysisResult.intentType === 'ready_to_purchase') {
      logger.info('Purchase intent detected, initiating conversion', {
        function_name: 'reply-detection',
        lead_id: lead.id,
        intent_type: analysisResult.intentType,
        analysis_method: analysisResult.aiError ? 'keyword_fallback' : 'ai_analysis'
      });
      
      await processDirectConversion(lead, analysisResult);
    } else {
      logger.info('Non-purchase intent detected, notifying admin', {
        function_name: 'reply-detection',
        lead_id: lead.id,
        intent_type: analysisResult.intentType,
        primary_concern: analysisResult.primaryConcern
      });
      
      await processManualReviewRequired(lead, analysisResult, replySubject, replyContent);
    }

    return new Response(JSON.stringify({
      success: true,
      leadId: lead.id,
      purchaseIntent: analysisResult.purchaseIntent,
      intentType: analysisResult.intentType,
      primaryConcern: analysisResult.primaryConcern,
      confidence: analysisResult.confidence,
      communicationLogged: true,
      analysisResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    logger.error('Error in reply-detection function', {
      function_name: 'reply-detection',
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

async function processDirectConversion(lead: any, analysisResult: any): Promise<void> {
  try {
    // Create QuickBooks customer and invoice
    const conversionResponse = await supabase.functions.invoke('quickbooks-conversion', {
      body: { leadId: lead.id, leadData: lead }
    });

    if (conversionResponse.error) {
      logger.error('QuickBooks conversion failed', {
        function_name: 'processDirectConversion',
        lead_id: lead.id,
        error_details: conversionResponse.error
      });
      throw new Error('Failed to create QuickBooks invoice');
    }

    // Send the invoice via QuickBooks
    const sendResponse = await supabase.functions.invoke('quickbooks-send-invoice', {
      body: {
        invoiceId: conversionResponse.data.invoiceId,
        recipientEmail: lead.director_email,
        leadId: lead.id
      }
    });

    // Update lead status
    await supabase
      .from('leads')
      .update({
        status: 'Invoice Sent',
        quickbooks_customer_id: conversionResponse.data.customerId,
        quickbooks_invoice_id: conversionResponse.data.invoiceId.toString(),
        quickbooks_invoice_number: conversionResponse.data.docNumber,
        invoice_status: sendResponse.error ? 'created' : 'sent',
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    logger.info('Lead converted and invoice processed', {
      function_name: 'processDirectConversion',
      lead_id: lead.id,
      invoice_id: conversionResponse.data.invoiceId,
      invoice_sent: !sendResponse.error
    });
  } catch (error: any) {
    logger.error('Error in direct conversion process', {
      function_name: 'processDirectConversion',
      lead_id: lead.id,
      error_details: error.message
    });
    throw error;
  }
}

async function processManualReviewRequired(lead: any, analysisResult: any, replySubject: string, replyContent: string): Promise<void> {
  try {
    // Get admin user email
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('role', 'admin')
      .limit(1)
      .single();

    const adminEmail = adminProfile?.email || 'admin@forteathletics.net';

    // Enhanced admin notification
    const adminNotificationContent = `
🔔 MANUAL RESPONSE REQUIRED - Customer Reply Detected

═══════════════════════════════════════════════════════════════

📋 LEAD INFORMATION:
• Name: ${lead.director_first_name} ${lead.director_last_name}
• Email: ${lead.director_email}
• Phone: ${lead.director_phone_number || 'Not provided'}
• School: ${lead.school_name || 'Not provided'}
• Program: ${lead.workout_program_name || lead.ensemble_program_name || 'Not specified'}
• Current Status: ${lead.status}
• Quote Amount: ${lead.discount_rate_dr ? `$${lead.discount_rate_dr}` : 'Not set'}

═══════════════════════════════════════════════════════════════

📧 CUSTOMER REPLY:
Subject: ${replySubject || 'No subject'}

Message:
"${replyContent}"

═══════════════════════════════════════════════════════════════

🤖 ANALYSIS RESULT:
• Intent Type: ${analysisResult.intentType}
• Purchase Intent: ${analysisResult.purchaseIntent ? 'YES' : 'NO'}
• Primary Concern: ${analysisResult.primaryConcern}
• Confidence Level: ${Math.round((analysisResult.confidence || 0) * 100)}%
• Analysis Method: ${analysisResult.aiError ? 'Keyword Fallback (AI Failed)' : 'AI Analysis'}

${analysisResult.suggestedResponse ? `Suggested Response:\n"${analysisResult.suggestedResponse}"` : ''}

═══════════════════════════════════════════════════════════════

🎯 NEXT STEPS:
1. Review the customer's message and analysis above
2. Click the link below to access the lead profile
3. Respond manually using the Email Composer
4. Update the lead status as appropriate

🔗 LEAD PROFILE: ${getLeadProfileUrl(lead.id)}

═══════════════════════════════════════════════════════════════

This is an automated notification from your LeadSense CRM system.
The customer's reply has been logged in the communication history.

Best regards,
LeadSense CRM Team`;

    // Send notification to admin
    const adminEmailResponse = await supabase.functions.invoke('send-email', {
      body: {
        to: adminEmail,
        subject: `🔔 Manual Reply Required: ${lead.director_first_name} ${lead.director_last_name} (${lead.school_name || 'Unknown School'})`,
        content: adminNotificationContent,
        leadId: lead.id,
        type: 'admin_notification'
      }
    });

    if (adminEmailResponse.error) {
      logger.error('Failed to send admin notification', {
        function_name: 'processManualReviewRequired',
        lead_id: lead.id,
        admin_email: adminEmail,
        error_details: adminEmailResponse.error
      });
    } else {
      logger.info('Admin notification sent successfully', {
        function_name: 'processManualReviewRequired',
        lead_id: lead.id,
        admin_email: adminEmail
      });
    }

    // Update lead status to indicate manual action is needed
    await supabase
      .from('leads')
      .update({
        status: 'Reply Received - Awaiting Action',
        ai_suggested_message: analysisResult.suggestedResponse,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    logger.info('Lead status updated to awaiting manual action', {
      function_name: 'processManualReviewRequired',
      lead_id: lead.id,
      new_status: 'Reply Received - Awaiting Action'
    });
  } catch (error: any) {
    logger.error('Error in manual review process', {
      function_name: 'processManualReviewRequired',
      lead_id: lead.id,
      error_details: error.message
    });
    throw error;
  }
}

async function analyzeReplyContentWithTieredAI(replyContent: string, leadData: any): Promise<any> {
  logger.info('Starting reply content analysis', {
    function_name: 'analyzeReplyContentWithTieredAI',
    lead_id: leadData.id,
    reply_content_length: replyContent?.length || 0
  });

  // Extract only the new content from the reply
  const cleanReplyContent = extractNewReplyContent(replyContent);
  
  logger.debug('Extracted clean reply content', {
    function_name: 'analyzeReplyContentWithTieredAI',
    lead_id: leadData.id,
    original_length: replyContent?.length || 0,
    clean_length: cleanReplyContent?.length || 0,
    clean_content: cleanReplyContent
  });

  // Enhanced prompt with better structure and clearer instructions
  const prompt = `CRITICAL: Analyze ONLY the customer's new reply content for a fitness program for marching bands. Ignore any quoted previous email content.

CUSTOMER'S NEW REPLY CONTENT TO ANALYZE:
"${cleanReplyContent}"

CONTEXT:
Customer: ${leadData.director_first_name} ${leadData.director_last_name}
School: ${leadData.school_name || 'Unknown'}
Program: ${leadData.workout_program_name || leadData.ensemble_program_name || 'Unknown'}

CRITICAL PURCHASE INTENT DETECTION:
Look for these EXACT purchase intent phrases in the customer's NEW reply content (case-insensitive):

PRIMARY PHRASES (HIGHEST PRIORITY - IMMEDIATE PURCHASE INTENT):
- "LOCK IT IN" (any variation: "lock it in", "Lock it in", "LOCK IT IN", "lock in", "yes lock it in", "yes, lock it in", etc.)

CONFIRMED PURCHASE PHRASES (purchaseIntent: true, intentType: "ready_to_purchase"):
- "yes" (when used as confirmation)
- "yes, lock it in"
- "lock it"
- "lock in" 
- "I'm in"
- "Count me in"
- "let's do it"
- "we're ready"
- "ready to proceed"
- "send the invoice"
- "send invoice"
- "we'll take it"
- "sign us up"
- "move forward"
- "proceed"
- "confirmed"
- "approve"
- "approved"

IMPORTANT RULES:
1. If the reply contains "lock it in" or "lock in" in ANY form, it is ALWAYS ready_to_purchase
2. If the reply is just "yes" or "yes," followed by purchase language, it is ready_to_purchase
3. Ignore any quoted email content that starts with ">" or "On [date]" or similar
4. Focus ONLY on what the customer actually wrote, not quoted content
5. Be case-insensitive when matching phrases
6. Remove punctuation when matching

Return ONLY valid JSON in this exact format:
{
  "purchaseIntent": boolean,
  "intentType": "ready_to_purchase" | "negotiating" | "inquiry" | "not_interested",
  "primaryConcern": "brief description of main topic/concern",
  "suggestedResponse": "professional response appropriate for intent type",
  "confidence": number between 0 and 1,
  "detectedPhrases": ["list of key phrases that influenced the decision"]
}`;

  // Use centralized tiered AI execution with enhanced error handling
  try {
    const result = await executeAIWithTieredFallback(prompt, 'analyzeReplyContentWithTieredAI', leadData.id);
    
    logger.info('AI reply analysis completed successfully', {
      function_name: 'analyzeReplyContentWithTieredAI',
      lead_id: leadData.id,
      purchase_intent: result.purchaseIntent,
      intent_type: result.intentType,
      confidence: result.confidence,
      provider_used: result.providerUsed,
      detected_phrases: result.detectedPhrases,
      clean_content_analyzed: cleanReplyContent
    });

    return result;
    
  } catch (error: any) {
    logger.error('All AI models failed for reply analysis - returning enhanced keyword analysis', {
      function_name: 'analyzeReplyContentWithTieredAI',
      lead_id: leadData.id,
      error_details: error.message,
      error_stack: error.stack,
      clean_content: cleanReplyContent
    });
    
    // Return enhanced keyword analysis as fallback
    return {
      ...keywordAnalysis,
      primaryConcern: `AI SERVICE ERROR: ${error.message}. Using enhanced keyword-based analysis as fallback.`,
      aiError: true,
      errorMessage: error.message,
      errorType: 'ai_service_failure'
    };
  }
}

/**
 * Enhanced keyword-based analysis with better pattern matching
 */
function performEnhancedKeywordAnalysis(content: string, leadData: any): any {
  const cleanContent = extractNewReplyContent(content);
  const lowerContent = cleanContent.toLowerCase().trim();
  
  logger.debug('Performing enhanced keyword analysis', {
    function_name: 'performEnhancedKeywordAnalysis',
    lead_id: leadData.id,
    clean_content: cleanContent,
    lower_content: lowerContent
  });
  
  // High-confidence purchase intent phrases with exact matching
  const highConfidencePhrases = [
    'lock it in',
    'lock in',
    'yes lock it in',
    'yes, lock it in',
    'yes lock in',
    'yes, lock in'
  ];
  
  // Medium-confidence purchase phrases
  const mediumConfidencePhrases = [
    'i\'m in',
    'count me in',
    'let\'s do it',
    'we\'re ready',
    'ready to proceed',
    'send the invoice',
    'send invoice',
    'we\'ll take it',
    'sign us up',
    'move forward',
    'proceed',
    'confirmed',
    'approve',
    'approved'
  ];
  
  // Simple yes patterns (high confidence when standalone)
  const simpleYesPatterns = [
    /^yes\.?$/,
    /^yes,?\s*$/,
    /^yes\s*!+$/
  ];
  
  const detectedKeywords: string[] = [];
  let purchaseIntent = false;
  let intentType = 'inquiry';
  let confidence = 0.1;
  
  // Check for high-confidence phrases first
  for (const phrase of highConfidencePhrases) {
    if (lowerContent.includes(phrase)) {
      detectedKeywords.push(phrase);
      purchaseIntent = true;
      intentType = 'ready_to_purchase';
      confidence = 0.95;
      
      logger.info('High-confidence purchase phrase detected', {
        function_name: 'performEnhancedKeywordAnalysis',
        lead_id: leadData.id,
        detected_phrase: phrase,
        confidence: confidence
      });
      break;
    }
  }
  
  // If no high-confidence phrase found, check medium-confidence
  if (!purchaseIntent) {
    for (const phrase of mediumConfidencePhrases) {
      if (lowerContent.includes(phrase)) {
        detectedKeywords.push(phrase);
        purchaseIntent = true;
        intentType = 'ready_to_purchase';
        confidence = 0.8;
        break;
      }
    }
  }
  
  // Check for simple yes patterns if no other phrases found
  if (!purchaseIntent) {
    for (const pattern of simpleYesPatterns) {
      if (pattern.test(lowerContent)) {
        detectedKeywords.push('yes (simple confirmation)');
        purchaseIntent = true;
        intentType = 'ready_to_purchase';
        confidence = 0.85;
        break;
      }
    }
  }
  
  // Check for negative responses
  const negativeKeywords = ['no thanks', 'not interested', 'we\'ll pass', 'no thank you', 'not right now', 'maybe later'];
  if (!purchaseIntent) {
    for (const keyword of negativeKeywords) {
      if (lowerContent.includes(keyword)) {
        detectedKeywords.push(keyword);
        purchaseIntent = false;
        intentType = 'not_interested';
        confidence = 0.9;
        break;
      }
    }
  }
  
  const suggestedResponse = purchaseIntent 
    ? `Thank you for confirming, ${leadData.director_first_name}! I'll prepare your invoice right away and send it to you shortly.`
    : `Thank you for your reply, ${leadData.director_first_name}. We've received your message and will review it shortly. Someone from our team will get back to you within 24 hours to address your questions or concerns.`;
  
  const result = {
    purchaseIntent,
    intentType,
    primaryConcern: purchaseIntent ? 'Customer confirmed purchase intent' : 'General inquiry or clarification needed',
    suggestedResponse,
    detectedPhrases: detectedKeywords,
    detectedKeywords,
    confidence,
    analysisMethod: 'enhanced_keyword_analysis'
  };
  
  logger.info('Enhanced keyword analysis completed', {
    function_name: 'performEnhancedKeywordAnalysis',
    lead_id: leadData.id,
    result: result
  });
  
  return result;
}

function getLeadProfileUrl(leadId: string): string {
  // Construct the URL to the lead profile in the CRM
  const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://your-crm-app.com';
  return `${baseUrl}/lead/${leadId}`;
}

/**
 * Extract only the new content from a reply, removing quoted previous emails
 */
function extractNewReplyContent(fullReplyContent: string): string {
  if (!fullReplyContent) return '';
  
  // Split by lines to process line by line
  const lines = fullReplyContent.split('\n');
  const newContentLines: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Stop processing when we hit quoted content indicators
    if (
      trimmedLine.startsWith('>') ||                    // Email quote marker
      trimmedLine.startsWith('On ') ||                  // "On [date], [person] wrote:"
      trimmedLine.includes('wrote:') ||                 // Email signature line
      trimmedLine.startsWith('From:') ||                // Email header
      trimmedLine.startsWith('Sent:') ||                // Email header
      trimmedLine.startsWith('To:') ||                  // Email header
      trimmedLine.startsWith('Subject:') ||             // Email header
      trimmedLine.includes('@') && trimmedLine.includes('wrote') // Email attribution
    ) {
      break; // Stop processing when we hit quoted content
    }
    
    // Add non-empty lines to new content
    if (trimmedLine.length > 0) {
      newContentLines.push(trimmedLine);
    }
  }
  
  const extractedContent = newContentLines.join(' ').trim();
  
  // If we couldn't extract meaningful content, return the first 200 characters
  if (!extractedContent || extractedContent.length < 3) {
    return fullReplyContent.substring(0, 200).trim();
  }
  
  return extractedContent;
}

serve(serve_handler);