import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';
import { logger } from './logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface AISettings {
  enabled: boolean;
  primary_model_provider: string;
  fallback_openai_enabled: boolean;
  fallback_deepseek_claude_enabled: boolean;
}

export interface ModelConfig {
  provider: string;
  model_id: string;
  name: string;
  apiKey: string;
}

/**
 * Fetch AI settings from the database
 */
export async function getAISettings(functionName: string, leadId?: string): Promise<AISettings | null> {
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

/**
 * Build prioritized model list based on AI settings
 */
export function buildModelPriority(aiSettings: AISettings): string[] {
  const modelPriority = [aiSettings.primary_model_provider];
  
  if (aiSettings.fallback_openai_enabled && !modelPriority.includes('OPENAI')) {
    modelPriority.push('OPENAI');
  }
  
  if (aiSettings.fallback_deepseek_claude_enabled) {
    if (!modelPriority.includes('DEEPSEEK')) modelPriority.push('DEEPSEEK');
    if (!modelPriority.includes('CLAUDE')) modelPriority.push('CLAUDE');
  }
  
  return modelPriority;
}

/**
 * Get model configuration for a specific provider
 */
export function getModelConfig(provider: string): ModelConfig | null {
  const configs: Record<string, Omit<ModelConfig, 'apiKey'>> = {
    GEMINI: {
      provider: 'GEMINI',
      model_id: 'gemini-pro',
      name: 'Google Gemini Pro'
    },
    OPENAI: {
      provider: 'OPENAI',
      model_id: 'gpt-3.5-turbo',
      name: 'OpenAI GPT-3.5 Turbo'
    },
    DEEPSEEK: {
      provider: 'DEEPSEEK',
      model_id: 'deepseek-chat',
      name: 'DeepSeek Chat'
    },
    CLAUDE: {
      provider: 'CLAUDE',
      model_id: 'claude-3-haiku-20240307',
      name: 'Anthropic Claude 3 Haiku'
    }
  };

  const config = configs[provider];
  if (!config) return null;

  const apiKeys: Record<string, string | undefined> = {
    GEMINI: Deno.env.get('GEMINI_API_KEY'),
    OPENAI: Deno.env.get('OPENAI_API_KEY'),
    DEEPSEEK: Deno.env.get('DEEPSEEK_API_KEY'),
    CLAUDE: Deno.env.get('CLAUDE_API_KEY')
  };

  const apiKey = apiKeys[provider];
  if (!apiKey) return null;

  return {
    ...config,
    apiKey
  };
}

/**
 * Execute AI call with retry logic for rate limits
 */
export async function executeAICall(
  modelConfig: ModelConfig,
  prompt: string,
  functionName: string,
  leadId?: string,
  maxRetries = 3
): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.info(`AI call attempt ${attempt + 1}/${maxRetries}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: modelConfig.provider,
        attempt: attempt + 1
      });

      let response: Response;

      if (modelConfig.provider === 'GEMINI') {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelConfig.model_id}:generateContent?key=${modelConfig.apiKey}`,
          {
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
          }
        );
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
              { role: 'system', content: 'You are an AI assistant for a music education services company. Generate professional content and respond with valid JSON only.' },
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
      } else if (modelConfig.provider === 'CLAUDE') {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${modelConfig.apiKey}`,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: modelConfig.model_id,
            max_tokens: 1500,
            temperature: 0.3,
            messages: [
              { role: 'user', content: prompt }
            ],
          }),
        });
      } else {
        throw new Error(`Provider ${modelConfig.provider} not yet implemented`);
      }

      // Handle rate limits specifically
      if (response.status === 429) {
        const errorText = await response.text();
        logger.warn(`Rate limit detected for ${modelConfig.provider} on attempt ${attempt + 1}`, {
          function_name: functionName,
          lead_id: leadId,
          provider: modelConfig.provider,
          attempt: attempt + 1,
          error_details: errorText
        });

        if (attempt < maxRetries - 1) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000);
          logger.info(`Waiting ${delayMs}ms before retry`, {
            function_name: functionName,
            lead_id: leadId,
            delay_ms: delayMs
          });
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        } else {
          throw new Error(`Rate limit exceeded for ${modelConfig.provider} after ${maxRetries} attempts`);
        }
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error (${modelConfig.provider}): ${response.status} ${response.statusText}. Details: ${errorText}`);
      }

      const data = await response.json();

      // Parse response based on provider
      let content: string;
      if (modelConfig.provider === 'GEMINI') {
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error('Invalid Gemini response structure');
        }
        content = data.candidates[0].content.parts[0].text;
      } else if (modelConfig.provider === 'OPENAI') {
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Invalid OpenAI response structure');
        }
        content = data.choices[0].message.content;
      } else if (modelConfig.provider === 'DEEPSEEK') {
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Invalid DeepSeek response structure');
        }
        content = data.choices[0].message.content;
      } else if (modelConfig.provider === 'CLAUDE') {
        if (!data.content?.[0]?.text) {
          throw new Error('Invalid Claude response structure');
        }
        content = data.content[0].text;
      } else {
        throw new Error(`Response parsing not implemented for ${modelConfig.provider}`);
      }

      // Clean and parse JSON
      const cleanContent = content.trim().replace(/```json\s*/g, '').replace(/```\s*/g, '');
      const parsedResult = JSON.parse(cleanContent);

      logger.info(`AI call successful for ${modelConfig.provider}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: modelConfig.provider,
        attempt: attempt + 1
      });

      return parsedResult;

    } catch (error: any) {
      lastError = error;
      
      logger.error(`AI call failed for ${modelConfig.provider} (attempt ${attempt + 1}/${maxRetries})`, {
        function_name: functionName,
        lead_id: leadId,
        provider: modelConfig.provider,
        attempt: attempt + 1,
        error_details: error.message
      });

      // If this is the last attempt, don't wait
      if (attempt === maxRetries - 1) {
        break;
      }

      // Wait before retrying (exponential backoff)
      const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries failed
  throw lastError || new Error(`All ${maxRetries} attempts failed for ${modelConfig.provider}`);
}

/**
 * Execute AI generation with tiered model fallback
 */
export async function executeAIWithTieredFallback(
  prompt: string,
  functionName: string,
  leadId?: string
): Promise<any> {
  logger.info('Starting tiered AI execution', {
    function_name: functionName,
    lead_id: leadId
  });

  // Get AI settings - this should already be checked by calling function, but double-check
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

  for (let i = 0; i < modelPriority.length; i++) {
    const provider = modelPriority[i];
    const modelConfig = getModelConfig(provider);
    
    if (!modelConfig) {
      logger.warn(`No configuration or API key found for provider ${provider}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: provider,
        available_env_vars: {
          gemini: !!Deno.env.get('GEMINI_API_KEY'),
          openai: !!Deno.env.get('OPENAI_API_KEY'),
          deepseek: !!Deno.env.get('DEEPSEEK_API_KEY'),
          claude: !!Deno.env.get('CLAUDE_API_KEY')
        }
      });
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

      const result = await executeAICall(modelConfig, prompt, functionName, leadId);
      
      logger.info(`AI generation successful with ${provider}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: provider,
        attempt: i + 1,
        total_attempts: i + 1
      });

      return {
        ...result,
        providerUsed: provider
      };

    } catch (error: any) {
      lastError = error;
      
      logger.error(`AI generation failed with ${provider}`, {
        function_name: functionName,
        lead_id: leadId,
        provider: provider,
        attempt: i + 1,
        error_details: error.message,
        remaining_models: modelPriority.length - i - 1
      });

      // If this is the last model, don't wait
      if (i === modelPriority.length - 1) {
        break;
      }

      // Wait before trying next model (exponential backoff)
      const delayMs = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All models failed
  logger.error('All AI models failed', {
    function_name: functionName,
    lead_id: leadId,
    models_tried: modelPriority,
    final_error: lastError?.message,
    total_models_attempted: modelPriority.length
  });
  
  throw lastError || new Error('All AI models failed');
}

/**
 * Create shared logger utility for AI functions
 */
export async function createAILogger(functionName: string) {
  return {
    info: (message: string, context?: any) => logger.info(message, { function_name: functionName, ...context }),
    warn: (message: string, context?: any) => logger.warn(message, { function_name: functionName, ...context }),
    error: (message: string, context?: any) => logger.error(message, { function_name: functionName, ...context }),
    debug: (message: string, context?: any) => logger.debug(message, { function_name: functionName, ...context }),
  };
}