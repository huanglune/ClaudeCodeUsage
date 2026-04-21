// Runtime pricing module.
//
// Source of truth at build time: src/pricing-data.json (regenerated weekly by
// scripts/update-pricing.ts via GitHub Actions and committed to main).
//
// Runtime flow:
//   1. Module load synchronously reads the bundled snapshot (fast, never fails
//      at activation).
//   2. initPricing(context) overlays any previously-cached runtime fetch from
//      globalStorage.
//   3. Unless claudeCodeUsage.pricingOfflineMode is true, a detached
//      background fetch updates globalStorage for the next launch.
//
// vscode is imported dynamically inside initPricing so that unit tests (which
// only exercise getModelPricing / calculateCostFromPricing) can load this
// module in plain Node without the vscode host being present.

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ModelPricing, PricingSnapshot } from './types';

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  reasoning_output_tokens?: number;
}

const TIERED_THRESHOLD = 200_000;
const LITELLM_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const RUNTIME_FETCH_TIMEOUT_MS = 30_000;

// Populated at module load from the bundled snapshot. initPricing() may
// overlay additions/updates from the runtime cache.
let pricing: Record<string, ModelPricing> = {};

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const snapshot = require('./pricing-data.json') as PricingSnapshot;
  pricing = snapshot.models;
} catch {
  // pricing-data.json should always exist in a built extension because
  // scripts/post-compile.mjs copies it into out/. If it's missing, prices
  // fall through to 0 rather than crashing activation.
  console.warn('[pricing] bundled snapshot not found; prices will be 0 until a refresh lands');
}

// Test-only hatch: swap the internal table. Used by src/pricing.test.ts.
export function _setPricingForTests(value: Record<string, ModelPricing>): void {
  pricing = value;
}

// Minimal structural type for the slice of ExtensionContext we touch.
// Keeps this module vscode-import-free at module load.
interface MinimalContext {
  globalStorageUri: { fsPath: string };
}

export async function initPricing(context: MinimalContext): Promise<void> {
  const cacheFile = path.join(context.globalStorageUri.fsPath, 'pricing-cache.json');
  const cached = await tryLoadCache(cacheFile);
  if (cached != null && cached.models != null) {
    pricing = { ...pricing, ...cached.models };
  }

  const vscode = await import('vscode');
  const offline = vscode.workspace
    .getConfiguration('claudeCodeUsage')
    .get<boolean>('pricingOfflineMode', false);

  if (!offline) {
    void refreshFromNetwork(cacheFile);
  }
}

async function tryLoadCache(file: string): Promise<PricingSnapshot | null> {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as PricingSnapshot;
  } catch {
    return null;
  }
}

async function refreshFromNetwork(cacheFile: string): Promise<void> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RUNTIME_FETCH_TIMEOUT_MS);
    const res = await fetch(LITELLM_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.json()) as Record<string, unknown>;

    const filtered: Record<string, ModelPricing> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!isSupportedKey(key)) continue;
      if (value == null || typeof value !== 'object') continue;
      filtered[key] = value as ModelPricing;
    }

    const snapshot: PricingSnapshot = {
      _meta: {
        source: LITELLM_URL,
        fetched_at: new Date().toISOString(),
        source_commit: 'runtime-fetch',
        model_count: Object.keys(filtered).length,
      },
      models: filtered,
    };

    pricing = { ...pricing, ...filtered };
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[pricing] background refresh failed, using snapshot:', (err as Error).message);
  }
}

function isSupportedKey(key: string): boolean {
  return (
    key.startsWith('claude-') ||
    key.startsWith('anthropic/claude-') ||
    key.startsWith('anthropic.claude-') ||
    key.startsWith('gpt-') ||
    key.startsWith('o1') ||
    key.startsWith('o3') ||
    key.startsWith('openai/gpt-') ||
    key.startsWith('openai/o')
  );
}

export function getModelPricing(modelName: string | undefined): ModelPricing | null {
  if (!modelName) return null;
  const normalized = modelName.replace(/^anthropic\//, '').trim();
  if (normalized.length === 0) return null;

  if (pricing[normalized]) return pricing[normalized];

  const variations = [
    normalized,
    `anthropic/${normalized}`,
    `anthropic.${normalized}`,
    `openai/${normalized}`,
    normalized.replace(/-\d{8}$/, ''),
  ];
  for (const v of variations) {
    if (pricing[v]) return pricing[v];
  }

  const stripped = stripKnownSuffix(normalized);
  if (stripped !== normalized) {
    const strippedResult = getModelPricing(stripped);
    if (strippedResult != null) {
      return strippedResult;
    }
  }

  const families = ['opus', 'haiku', 'sonnet', 'gpt-5', 'gpt-4.1', 'gpt-4o', 'o3', 'o1'] as const;
  for (const family of families) {
    if (normalized.includes(family)) {
      const candidate = latestOfFamily(family);
      if (candidate != null) return candidate;
    }
  }

  const lastResort = latestOfFamily('sonnet');
  if (lastResort == null) return null;
  console.warn(`[pricing] unknown model '${normalized}', using latest sonnet as fallback`);
  return lastResort;
}

function stripKnownSuffix(model: string): string {
  const suffixes = ['-codex-max-xhigh', '-codex', '-high', '-low', '-thinking'] as const;
  for (const suffix of suffixes) {
    if (model.endsWith(suffix) && model.length > suffix.length) {
      return model.slice(0, -suffix.length);
    }
  }
  return model;
}

function latestOfFamily(family: string): ModelPricing | null {
  // Lexicographic sort — model names carry monotone version suffixes
  // (claude-opus-4-7 < claude-opus-4-7-20260416). Dated IDs win over bare
  // aliases, which matches the Anthropic canonical-ID convention.
  const keys = Object.keys(pricing).filter((k) => k.includes(family)).sort();
  const last = keys[keys.length - 1];
  return last ? pricing[last] : null;
}

export function calculateCostFromPricing(tokens: TokenUsage, p: ModelPricing): number {
  return (
    tieredCost(tokens.input_tokens, p.input_cost_per_token, p.input_cost_per_token_above_200k_tokens) +
    tieredCost(tokens.output_tokens, p.output_cost_per_token, p.output_cost_per_token_above_200k_tokens) +
    tieredCost(
      tokens.cache_creation_input_tokens,
      p.cache_creation_input_token_cost,
      p.cache_creation_input_token_cost_above_200k_tokens,
    ) +
    tieredCost(
      tokens.cache_read_input_tokens,
      p.cache_read_input_token_cost,
      p.cache_read_input_token_cost_above_200k_tokens,
    ) +
    tieredCost(
      tokens.reasoning_output_tokens,
      p.output_cost_per_token,
      p.output_cost_per_token_above_200k_tokens,
    )
  );
}

function tieredCost(
  total: number | undefined,
  basePrice: number | undefined,
  tieredPrice: number | undefined,
): number {
  if (total == null || total <= 0) return 0;
  if (total > TIERED_THRESHOLD && tieredPrice != null) {
    const base = Math.min(total, TIERED_THRESHOLD);
    const above = total - TIERED_THRESHOLD;
    let sum = above * tieredPrice;
    if (basePrice != null) sum += base * basePrice;
    return sum;
  }
  return basePrice != null ? total * basePrice : 0;
}

export function calculateCostFromTokens(tokens: TokenUsage, modelName: string | undefined): number {
  const p = getModelPricing(modelName);
  return p ? calculateCostFromPricing(tokens, p) : 0;
}
