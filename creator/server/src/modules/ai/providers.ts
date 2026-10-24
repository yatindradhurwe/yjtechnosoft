import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { getIntegration } from '../../services/integrations';
import { unavailable } from '../../lib/errors';

/** Provider-independent chat with tool calling */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema object */
  parameters: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  refused: boolean;
  toolCalls: { name: string; input: unknown }[];
}

export type ToolExecutor = (name: string, input: unknown) => Promise<unknown>;

/** Estimated list price per million tokens, USD (input, output) */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-fable-5-1': [10, 50],
};

export function estimateCostMicros(model: string, input: number, output: number) {
  const [i, o] = PRICES[model] ?? [4, 20];
  return Math.round(input * i + output * o); // tokens × $/MTok = micro-USD
}

export interface AiConfig {
  provider: 'anthropic' | 'openai';
  model: string;
  apiKey: string;
}

export async function aiConfig(): Promise<AiConfig | null> {
  const stored = await getIntegration('platform', 'AI');
  if (stored?.enabled && stored.secrets.apiKey) {
    const provider = (stored.config.provider === 'openai' ? 'openai' : 'anthropic') as AiConfig['provider'];
    return { provider, model: String(stored.config.model || (provider === 'anthropic' ? 'claude-opus-5-5' : 'gpt-5')), apiKey: stored.secrets.apiKey };
  }
  if (env.AI_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY) return { provider: 'anthropic', model: env.AI_MODEL ?? 'claude-opus-5-5', apiKey: env.ANTHROPIC_API_KEY };
  if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY) return { provider: 'openai', model: env.AI_MODEL ?? 'gpt-5', apiKey: env.OPENAI_API_KEY };
  return null;
}

const MAX_TOOL_ROUNDS = 6;

async function anthropicChat(cfg: AiConfig, system: string, turns: ChatTurn[], tools: ToolDef[], exec: ToolExecutor): Promise<ChatResult> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  const result: ChatResult = { text: '', inputTokens: 0, outputTokens: 0, model: cfg.model, provider: 'anthropic', refused: false, toolCalls: [] };
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort: 'medium' },
      // Server-side fallback on safety refusals (routes by refusal category)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...(tools.length
        ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters, strict: true })) }
        : {}),
    });
    result.inputTokens += response.usage.input_tokens;
    result.outputTokens += response.usage.output_tokens;
    result.model = response.model;
    if (response.stop_reason === 'refusal') {
      result.refused = true;
      return result;
    }
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    result.text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) return result;
    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      result.toolCalls.push({ name: tu.name, input: tu.input });
      try {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(await exec(tu.name, tu.input)) });
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: e instanceof Error ? e.message : 'Tool failed', is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return result;
}

async function openaiChat(cfg: AiConfig, system: string, turns: ChatTurn[], tools: ToolDef[], exec: ToolExecutor): Promise<ChatResult> {
  type Msg = { role: string; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]; tool_call_id?: string };
  const messages: Msg[] = [{ role: 'system', content: system }, ...turns];
  const result: ChatResult = { text: '', inputTokens: 0, outputTokens: 0, model: cfg.model, provider: 'openai', refused: false, toolCalls: [] };
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters, strict: true } })) } : {}),
      }),
    });
    const json = (await res.json()) as { choices?: { message: Msg; finish_reason: string }[]; usage?: { prompt_tokens: number; completion_tokens: number }; error?: { message: string } };
    if (!res.ok || !json.choices) throw new Error(`AI provider error: ${json.error?.message ?? res.status}`);
    result.inputTokens += json.usage?.prompt_tokens ?? 0;
    result.outputTokens += json.usage?.completion_tokens ?? 0;
    const msg = json.choices[0].message;
    result.text = msg.content ?? '';
    if (!msg.tool_calls?.length) return result;
    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let out: unknown;
      try {
        const input = JSON.parse(tc.function.arguments);
        result.toolCalls.push({ name: tc.function.name, input });
        out = await exec(tc.function.name, input);
      } catch (e) {
        out = { error: e instanceof Error ? e.message : 'Tool failed' };
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
    }
  }
  return result;
}

export async function chat(system: string, turns: ChatTurn[], tools: ToolDef[] = [], exec: ToolExecutor = async () => null): Promise<ChatResult> {
  const cfg = await aiConfig();
  if (!cfg) throw unavailable('The AI assistant is not configured. A platform admin can add an AI provider key in Admin › Integrations.');
  return cfg.provider === 'anthropic' ? anthropicChat(cfg, system, turns, tools, exec) : openaiChat(cfg, system, turns, tools, exec);
}
