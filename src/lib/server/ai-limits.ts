import { runtimeConfig } from './config';
import { ApiError } from './http';

export const AI_HARD_LIMITS = Object.freeze({ concurrent: 2, minute: 12, hour: 120, day: 300 });
type Window = { used: number; resets: number; duration: number; limit: 'minute' | 'hour' | 'day' };
type LimiterState = { active: number; windows: Window[] };
const globalState = globalThis as typeof globalThis & { __bhuverifyPrototypeAiLimits?: LimiterState };

function state(): LimiterState {
  // Both route bundles share the same process budget, not a budget per endpoint.
  return globalState.__bhuverifyPrototypeAiLimits ??= {
    active: 0,
    windows: [
      { used: 0, resets: 0, duration: 60_000, limit: 'minute' },
      { used: 0, resets: 0, duration: 3_600_000, limit: 'hour' },
      { used: 0, resets: 0, duration: 86_400_000, limit: 'day' },
    ],
  };
}

function effectiveLimit(name: keyof typeof AI_HARD_LIMITS) {
  const setting = process.env[`BHUVERIFY_AI_LIMIT_${name.toUpperCase()}`]?.trim();
  const parsed = setting && /^\d+$/.test(setting) ? Number(setting) : AI_HARD_LIMITS[name];
  // Settings can lower limits, never disable them or raise the hard ceiling.
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, AI_HARD_LIMITS[name]) : AI_HARD_LIMITS[name];
}

/** Coarse per-process guard only: restarts and additional instances reset/multiply it. */
export function acquireAiSlot(): () => void {
  if (!runtimeConfig().aiEnabled) throw new ApiError(503, 'Gemini is not enabled. Configure the server-only GEMINI_API_KEY and enable AI, or use manual document review.');
  const current = state();
  const now = Date.now();
  if (current.active >= effectiveLimit('concurrent')) throw new ApiError(429, 'The prototype is processing other AI requests. Please try again shortly.');
  for (const window of current.windows) {
    if (now >= window.resets) { window.used = 0; window.resets = now + window.duration; }
    if (window.used >= effectiveLimit(window.limit)) throw new ApiError(429, `The prototype’s shared AI ${window.limit} limit has been reached. Please try again later or use manual review.`);
  }
  for (const window of current.windows) window.used++;
  current.active++;
  let released = false;
  return () => { if (!released) { released = true; current.active--; } };
}

export async function withAiSlot<T>(operation: () => Promise<T>): Promise<T> {
  const release = acquireAiSlot();
  try { return await operation(); }
  finally { release(); }
}
