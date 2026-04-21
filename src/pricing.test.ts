import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ModelPricing } from './types';
import {
  getModelPricing,
  calculateCostFromPricing,
  calculateCostFromTokens,
  _setPricingForTests,
} from './pricing';

const opusPricing: ModelPricing = {
  input_cost_per_token: 5e-6,
  output_cost_per_token: 2.5e-5,
  cache_creation_input_token_cost: 6.25e-6,
  cache_read_input_token_cost: 5e-7,
  input_cost_per_token_above_200k_tokens: 1e-5,
  output_cost_per_token_above_200k_tokens: 5e-5,
};

const sonnetPricing: ModelPricing = {
  input_cost_per_token: 3e-6,
  output_cost_per_token: 15e-6,
  cache_creation_input_token_cost: 3.75e-6,
  cache_read_input_token_cost: 3e-7,
};

const gpt5Pricing: ModelPricing = {
  input_cost_per_token: 1.25e-6,
  output_cost_per_token: 10e-6,
};

const gpt54Pricing: ModelPricing = {
  input_cost_per_token: 2e-6,
  output_cost_per_token: 16e-6,
};

test.beforeEach(() => {
  _setPricingForTests({
    'claude-opus-4-7': opusPricing,
    'claude-opus-4-7-20260416': opusPricing,
    'claude-sonnet-4-6-20260401': sonnetPricing,
    'claude-sonnet-4-6': sonnetPricing,
    'gpt-5': gpt5Pricing,
    'gpt-5-20260101': gpt5Pricing,
    'gpt-5.4-20260201': gpt54Pricing,
    'gpt-4o': {
      input_cost_per_token: 1e-6,
      output_cost_per_token: 2e-6,
    },
  });
});

test('getModelPricing exact match', () => {
  assert.deepEqual(getModelPricing('claude-opus-4-7'), opusPricing);
});

test('getModelPricing strips anthropic/ prefix', () => {
  assert.deepEqual(getModelPricing('anthropic/claude-opus-4-7'), opusPricing);
});

test('getModelPricing falls back to family when unknown exact id', () => {
  const p = getModelPricing('claude-opus-9000-experimental');
  assert.deepEqual(p, opusPricing);
});

test('getModelPricing strips -codex suffix for gpt models', () => {
  const p = getModelPricing('gpt-5-codex');
  assert.deepEqual(p, gpt5Pricing);
});

test('getModelPricing strips layered suffix first (-codex-max-xhigh)', () => {
  const p = getModelPricing('gpt-5-codex-max-xhigh');
  assert.deepEqual(p, gpt5Pricing);
});

test('getModelPricing family-fallback for future gpt-5 variant', () => {
  const p = getModelPricing('gpt-5.7-preview');
  assert.deepEqual(p, gpt54Pricing);
});

test('getModelPricing returns null for empty input', () => {
  assert.equal(getModelPricing(undefined), null);
  assert.equal(getModelPricing(''), null);
});

test('calculateCostFromPricing — flat rate, under 200k', () => {
  const cost = calculateCostFromPricing(
    { input_tokens: 1000, output_tokens: 500 },
    sonnetPricing,
  );
  assert.ok(Math.abs(cost - 0.0105) < 1e-9);
});

test('calculateCostFromPricing — tiered above 200k input', () => {
  const cost = calculateCostFromPricing(
    { input_tokens: 300_000, output_tokens: 0 },
    opusPricing,
  );
  // 200_000 * 5e-6 + 100_000 * 1e-5 = 1.0 + 1.0 = 2.0
  assert.ok(Math.abs(cost - 2.0) < 1e-9);
});

test('calculateCostFromPricing — exactly 200k uses base rate only', () => {
  const cost = calculateCostFromPricing(
    { input_tokens: 200_000, output_tokens: 0 },
    opusPricing,
  );
  assert.ok(Math.abs(cost - 1.0) < 1e-9);
});

test('calculateCostFromPricing — all four token types', () => {
  const cost = calculateCostFromPricing(
    {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 2000,
      cache_read_input_tokens: 3000,
    },
    opusPricing,
  );
  const expected = 1000 * 5e-6 + 500 * 2.5e-5 + 2000 * 6.25e-6 + 3000 * 5e-7;
  assert.ok(Math.abs(cost - expected) < 1e-9);
});

test('calculateCostFromPricing includes reasoning at output rate', () => {
  const cost = calculateCostFromPricing(
    {
      input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 100,
    },
    {
      output_cost_per_token: 1e-5,
    },
  );
  assert.ok(Math.abs(cost - 0.001) < 1e-9);
});

test('calculateCostFromTokens routes through getModelPricing', () => {
  const cost = calculateCostFromTokens(
    { input_tokens: 1000, output_tokens: 500 },
    'claude-opus-4-7',
  );
  const expected = 1000 * 5e-6 + 500 * 2.5e-5;
  assert.ok(Math.abs(cost - expected) < 1e-9);
});

test('calculateCostFromTokens last-resort sonnet for unknown-family model', () => {
  const cost = calculateCostFromTokens(
    { input_tokens: 1000, output_tokens: 500 },
    'some-unknown-provider-model',
  );
  const expected = 1000 * 3e-6 + 500 * 15e-6;
  assert.ok(Math.abs(cost - expected) < 1e-9);
});

test('unknown Claude name still falls back to latest sonnet', () => {
  const p = getModelPricing('claude-future-experimental-xyz');
  assert.deepEqual(p, sonnetPricing);
});
