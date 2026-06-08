import Anthropic from '@anthropic-ai/sdk';
import { info, error } from './logger.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function withRetry(fn, agentName, attempt = 1) {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      error(agentName, `Claude API failed after ${MAX_RETRIES} retries`, { error: err.message });
      throw err;
    }
    const delay = Math.pow(2, attempt) * 1000;
    info(agentName, `Claude API error — retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`, { error: err.message });
    await new Promise((r) => setTimeout(r, delay));
    return withRetry(fn, agentName, attempt + 1);
  }
}

export async function chat({ system, messages, agentName = 'anthropicClient', maxTokens = 2048, temperature = 0.7 }) {
  if (process.env.DRY_RUN === 'true') {
    info(agentName, '[DRY_RUN] Skipping Claude API call');
    return { content: '[DRY_RUN: Mock Claude response]', usage: {} };
  }
  info(agentName, 'Calling Claude API', { model: MODEL, maxTokens });
  return withRetry(async () => {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    });
    const content = response.content[0]?.text || '';
    info(agentName, 'Claude API response received', {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      chars: content.length,
    });
    return { content, usage: response.usage };
  }, agentName);
}

export async function extractJSON(text) {
  const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
