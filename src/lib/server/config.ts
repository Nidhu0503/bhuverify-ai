import type { RuntimeConfig } from '../types';

const env = (name: string) => process.env[name]?.trim() ?? '';

/** Public metadata only. Never put an API key or provider error in this object. */
export function runtimeConfig(): RuntimeConfig {
  return {
    persistence: 'browser', originalRetention: 'none', authRequired: false, firebase: null,
    aiEnabled: env('BHUVERIFY_AI_ENABLED') !== 'false' && Boolean(env('GEMINI_API_KEY')),
    model: env('GEMINI_MODEL') || 'gemini-3.8-flash',
  };
}
