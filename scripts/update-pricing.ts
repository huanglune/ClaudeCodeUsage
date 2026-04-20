// Build-time tool: fetches Claude model pricing from the LiteLLM community
// dataset, runs three guardrails (schema, per-field sanity bounds, diff-based
// 10x jump detector), and writes src/pricing-data.json on change.
//
// Exit codes:
//   0 — success (wrote file if changed, or no-op if unchanged)
//   1 — real failure (network, schema, guardrail violation)
//
// Run manually: `npm run update-pricing`
// Run in CI   : `.github/workflows/update-pricing.yml` every Monday 03:00 UTC.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ModelPricing, PricingSnapshot } from '../src/types';

// ---------- Constants ----------

const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const LITELLM_COMMIT_URL = 'https://api.github.com/repos/BerriAI/litellm/commits/main';
const SNAPSHOT_PATH = resolve('src/pricing-data.json');
const FETCH_TIMEOUT_MS = 10_000;
const FETCH_RETRIES = 3;

const MAX_REASONABLE_PRICE_PER_TOKEN = 1e-3; // $1000 / 1M tokens

const PRICE_FIELDS: readonly (keyof ModelPricing)[] = [
  'input_cost_per_token',
  'output_cost_per_token',
  'cache_creation_input_token_cost',
  'cache_read_input_token_cost',
  'input_cost_per_token_above_200k_tokens',
  'output_cost_per_token_above_200k_tokens',
  'cache_creation_input_token_cost_above_200k_tokens',
  'cache_read_input_token_cost_above_200k_tokens',
];

const ALLOWED_NUMBER_FIELDS: readonly (keyof ModelPricing)[] = [
  ...PRICE_FIELDS,
  'max_input_tokens',
  'max_output_tokens',
];

const CLAUDE_PREFIXES = ['claude-', 'anthropic/claude-', 'anthropic.claude-'] as const;

const MAX_RATIO = 10;
const MIN_RATIO = 1 / MAX_RATIO;

// ---------- Pure validators (tested) ----------

export type ValidationResult =
  | { ok: true; value: ModelPricing }
  | { ok: false; reason: string };

export function validateModelPricing(input: unknown): ValidationResult {
  if (input == null || typeof input !== 'object') {
    return { ok: false, reason: 'not an object' };
  }
  const obj = input as Record<string, unknown>;
  const out: ModelPricing = {};

  for (const field of ALLOWED_NUMBER_FIELDS) {
    const v = obj[field];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, reason: `${field} is not a finite number` };
    }
    const isPrice = (PRICE_FIELDS as readonly string[]).includes(field as string);
    if (isPrice) {
      if (v < 0) return { ok: false, reason: `${field} is negative` };
      if (v > MAX_REASONABLE_PRICE_PER_TOKEN) {
        return { ok: false, reason: `${field} exceeds sanity bound (${v} > ${MAX_REASONABLE_PRICE_PER_TOKEN})` };
      }
    } else {
      if (v <= 0) return { ok: false, reason: `${field} is not positive` };
    }
    (out as Record<string, number>)[field] = v;
  }

  const hasAnyPrice = PRICE_FIELDS.some((f) => out[f] !== undefined);
  if (!hasAnyPrice) {
    return { ok: false, reason: 'no price fields present' };
  }
  return { ok: true, value: out };
}

function isClaudeKey(key: string): boolean {
  return CLAUDE_PREFIXES.some((p) => key.startsWith(p));
}

export function filterClaudeModels(raw: Record<string, unknown>): Record<string, ModelPricing> {
  const out: Record<string, ModelPricing> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isClaudeKey(key)) continue;
    const v = validateModelPricing(value);
    if (!v.ok) continue;
    out[key] = v.value;
  }
  return out;
}

export type SanityResult = { ok: true } | { ok: false; reason: string };

export function sanityCheckAgainstPrevious(
  prev: Record<string, ModelPricing>,
  next: Record<string, ModelPricing>,
): SanityResult {
  for (const [modelName, prevPricing] of Object.entries(prev)) {
    const nextPricing = next[modelName];
    if (nextPricing == null) {
      return { ok: false, reason: `model '${modelName}' disappeared from upstream` };
    }
    for (const field of PRICE_FIELDS) {
      const pv = prevPricing[field];
      const nv = nextPricing[field];
      if (pv == null || nv == null) continue;
      if (pv === 0 && nv === 0) continue;
      if (pv === 0 || nv === 0) {
        return { ok: false, reason: `${modelName}.${field} crossed zero (${pv} -> ${nv})` };
      }
      const ratio = nv / pv;
      if (ratio > MAX_RATIO || ratio < MIN_RATIO) {
        return {
          ok: false,
          reason: `${modelName}.${field} changed ${ratio.toFixed(2)}x (${pv} -> ${nv}); exceeds ${MAX_RATIO}x guardrail`,
        };
      }
    }
  }
  return { ok: true };
}

// ---------- IO layer (not directly tested — exercised by the script run) ----------

async function fetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'claude-code-usage-community/pricing-updater' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res;
  } catch (err) {
    if (attempt >= FETCH_RETRIES) throw err;
    const delay = 1000 * 2 ** (attempt - 1);
    console.warn(`[pricing] fetch attempt ${attempt} failed (${(err as Error).message}), retrying in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiteLLMPricing(): Promise<Record<string, unknown>> {
  const res = await fetchWithRetry(LITELLM_URL);
  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchLiteLLMHeadSha(): Promise<string> {
  const res = await fetchWithRetry(LITELLM_COMMIT_URL);
  const json = (await res.json()) as { sha?: string };
  if (typeof json.sha !== 'string') throw new Error('GitHub API did not return a sha');
  return json.sha.slice(0, 8);
}

function loadPrevious(): PricingSnapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as PricingSnapshot;
  } catch (err) {
    throw new Error(`Failed to parse existing snapshot: ${(err as Error).message}`);
  }
}

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted = {} as T;
  for (const k of Object.keys(obj).sort()) {
    (sorted as Record<string, unknown>)[k] = obj[k];
  }
  return sorted;
}

function modelsDiffer(a: Record<string, ModelPricing>, b: Record<string, ModelPricing>): boolean {
  return JSON.stringify(sortKeys(a)) !== JSON.stringify(sortKeys(b));
}

async function main(): Promise<void> {
  console.log('[pricing] fetching LiteLLM dataset...');
  const [raw, sourceCommit] = await Promise.all([fetchLiteLLMPricing(), fetchLiteLLMHeadSha()]);

  const filtered = filterClaudeModels(raw);
  const modelCount = Object.keys(filtered).length;
  if (modelCount === 0) {
    throw new Error('No Claude models found in LiteLLM dataset — bailing out (would produce empty snapshot)');
  }
  console.log(`[pricing] kept ${modelCount} Claude models`);

  const prev = loadPrevious();
  if (prev != null) {
    const sanity = sanityCheckAgainstPrevious(prev.models, filtered);
    if (!sanity.ok) {
      throw new Error(`Sanity check failed: ${sanity.reason}`);
    }
    if (!modelsDiffer(prev.models, filtered)) {
      console.log('[pricing] no semantic change vs existing snapshot — nothing written');
      return;
    }
  }

  const snapshot: PricingSnapshot = {
    _meta: {
      source: LITELLM_URL,
      fetched_at: new Date().toISOString(),
      source_commit: sourceCommit,
      model_count: modelCount,
    },
    models: sortKeys(filtered),
  };

  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  console.log(`[pricing] wrote ${SNAPSHOT_PATH} (${modelCount} models, source sha ${sourceCommit})`);
}

// Only run main() when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error('[pricing] FAILED:', (err as Error).message ?? err);
    process.exit(1);
  });
}
