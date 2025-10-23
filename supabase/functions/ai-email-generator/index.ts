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
          // Use retry-after header if available, otherwise exponential backoff
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

interface EmailGenerationRequest {
  leadData: {
    id: string;
    director_first_name: string;
    director_last_name: string;
    director_email: string;
    school_name?: string;
    ensemble_program_name?: string;
    workout_program_name?: string;
    estimated_performers?: number;
    season?: string;
    status: string;
  };
  emailType: 'initial_outreach' | 'follow_up' | 'quote_follow_up' | 'thank_you' | 'custom';
  tone?: 'professional' | 'friendly' | 'urgent';
}

const serve_handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let leadData: any = null;

  try {
    const { leadData: requestLeadData, emailType, tone = 'professional' }: EmailGenerationRequest = await req.json();
    leadData = requestLeadData;

    if (!leadData) {
      logger.error('Lead data is required', {
        function_name: 'ai-email-generator'
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'Lead data is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('Starting AI email generation', {
      function_name: 'ai-email-generator',
      lead_id: leadData.id,
      email_type: emailType,
      tone: tone,
      recipient: `${leadData.director_first_name} ${leadData.director_last_name}`
    });

    // CRITICAL: Check AI settings and master kill switch FIRST
    const aiSettings = await getAISettings('ai-email-generator', leadData.id);
    
    if (!aiSettings) {
      logger.error('No AI settings found in database - AI functionality disabled', {
        function_name: 'ai-email-generator',
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
      logger.info('AI is disabled via master kill switch - stopping email generation completely', {
        function_name: 'ai-email-generator',
        lead_id: leadData.id,
        ai_enabled: aiSettings.enabled
      });
      return new Response(JSON.stringify({
        success: false,
        error: 'AI generation is currently disabled. Please enable AI in the Integration Hub to generate emails.',
        errorType: 'ai_disabled',
        aiDisabled: true
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logger.info('AI is enabled, proceeding with email generation', {
      function_name: 'ai-email-generator',
      lead_id: leadData.id,
      ai_enabled: aiSettings.enabled,
      primary_provider: aiSettings.primary_model_provider
    });

    // Generate the prompt
    const prompt = generateEmailPrompt(leadData, emailType, tone);

    // Try AI generation with tiered execution
    const aiResponse = await executeAIWithTieredFallback(prompt, 'ai-email-generator', leadData.id);

    logger.info('AI email generation completed successfully', {
      function_name: 'ai-email-generator',
      lead_id: leadData.id,
      subject_length: aiResponse.subject?.length || 0,
      body_length: aiResponse.body?.length || 0,
      provider_used: aiResponse.providerUsed
    });

    return new Response(JSON.stringify({
      success: true,
      subject: aiResponse.subject,
      body: aiResponse.body,
      emailType: emailType,
      generatedAt: new Date().toISOString(),
      providerUsed: aiResponse.providerUsed
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    logger.error('Critical error in ai-email-generator function', {
      function_name: 'ai-email-generator',
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

function generateEmailPrompt(leadData: EmailGenerationRequest['leadData'], emailType: EmailGenerationRequest['emailType'], tone: string): string {
  const firstName = leadData.director_first_name || 'there';
  const lastName = leadData.director_last_name || '';
  const schoolName = leadData.school_name || 'your school';
  const programName = leadData.workout_program_name || leadData.ensemble_program_name || 'your music program';
  const performers = leadData.estimated_performers || 'your group';
  const season = leadData.season || 'this season';
  const currentStatus = leadData.status;

  let basePrompt = `Generate a professional email for a music education lead:

Lead Details:
- Name: ${firstName} ${lastName}
- School: ${schoolName}
- Program: ${programName}
- Estimated Performers: ${performers}
- Season: ${season}
- Current Status: ${currentStatus}
- Tone: ${tone}

Email Type: ${emailType}`;

  let specificInstructions = '';
  
  switch (emailType) {
    case 'initial_outreach':
      specificInstructions = `
This is an initial outreach email. Include:
- Brief introduction to LeadSense CRM
- How we help marching band programs
- Mention our fitness training for performers
- Request for a brief call or meeting
- Professional but engaging tone`;
      break;
    case 'follow_up':
      specificInstructions = `
This is a follow-up email. Include:
- Reference previous communication
- Add value with new information
- Gentle reminder about our services
- Clear next steps`;
      break;
    case 'quote_follow_up':
      specificInstructions = `
This is a quote follow-up email. Include:
- Reference the previously sent quote
- Address potential concerns
- Highlight value and benefits
- Create appropriate urgency
- Clear call to action`;
      break;
    case 'thank_you':
      specificInstructions = `
This is a thank you email. Include:
- Express genuine gratitude
- Summarize next steps
- Provide additional resources
- Maintain the relationship`;
      break;
    case 'custom':
      specificInstructions = `
This is a custom email. Be professional and helpful.`;
      break;
  }

  const fullPrompt = `${basePrompt}

${specificInstructions}

CRITICAL: Respond with valid JSON only in this exact format:
{
  "subject": "Your email subject here",
  "body": "Your email body content here"
}

Do not include any markdown formatting, code blocks, or additional text outside the JSON.`;

  return fullPrompt;
}

serve(serve_handler);