/**
 * OpenAI GPT クライアント（gpt-4o-mini ラッパー）
 */
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not found in .env');
}

export const openai = new OpenAI({ apiKey });

export async function callGptJson<T>(
  prompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<T> {
  const response = await openai.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('GPT returned empty content');
  }

  try {
    return JSON.parse(content) as T;
  } catch (e) {
    throw new Error(`GPT response is not valid JSON: ${content.substring(0, 200)}`);
  }
}
