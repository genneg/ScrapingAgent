import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/logger';
import { Result } from '@/types';
import { withCircuitBreaker } from '@/lib/circuit-breaker';

// Helper functions for Result type
function Ok<T>(data: T): Result<T, Error> {
  return { success: true, data };
}

function Err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// Claude API configuration
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.1;

// Validate configuration
if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY,
});

export interface AnthropicConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AnthropicMessageOptions {
  prompt: string;
  systemPrompt?: string;
  config?: AnthropicConfig;
}

export interface AnthropicResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Send a message to Claude API with proper error handling
 */
export async function sendAnthropicMessage(
  options: AnthropicMessageOptions
): Promise<Result<AnthropicResponse, Error>> {
  try {
    const { prompt, systemPrompt, config = {} } = options;

    const message = await withCircuitBreaker('claudeApi', async () => {
      return await anthropic.messages.create({
        model: config.model || ANTHROPIC_MODEL,
        max_tokens: config.maxTokens || MAX_TOKENS,
        temperature: config.temperature || TEMPERATURE,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });
    });

    const response: AnthropicResponse = {
      content: message.content[0].type === 'text' ? message.content[0].text : '',
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };

    logger.info('Claude API request successful', {
      model: response.model,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });

    return Ok(response);
  } catch (error) {
    logger.error('Claude API request failed', { error });

    if (error instanceof Anthropic.APIError) {
      return Err(new Error(`Anthropic API Error: ${error.message}`));
    }

    return Err(error instanceof Error ? error : new Error('Unknown error occurred'));
  }
}

/**
 * Validate Claude API configuration
 */
export function validateAnthropicConfig(): Result<void, Error> {
  try {
    if (!ANTHROPIC_API_KEY) {
      return Err(new Error('ANTHROPIC_API_KEY is required'));
    }

    if (ANTHROPIC_API_KEY.length < 10) {
      return Err(new Error('ANTHROPIC_API_KEY appears to be invalid'));
    }

    return Ok(undefined);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error('Configuration validation failed'));
  }
}

export { anthropic };

// Export constants for reuse
export const ANTHROPIC_CONSTANTS = {
  MODEL: ANTHROPIC_MODEL,
  MAX_TOKENS,
  TEMPERATURE,
} as const;