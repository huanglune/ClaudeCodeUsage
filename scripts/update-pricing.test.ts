import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  validateModelPricing,
  filterClaudeModels,
  sanityCheckAgainstPrevious,
} from './update-pricing';

// ---------- validateModelPricing ----------

test('validateModelPricing accepts a minimal valid entry (input cost only)', () => {
  const result = validateModelPricing({ input_cost_per_token: 3e-6 });
  assert.equal(result.ok, true);
});

test('validateModelPricing accepts a full tiered entry', () => {
  const result = validateModelPricing({
    input_cost_per_token: 5e-6,
    output_cost_per_token: 2.5e-5,
    cache_creation_input_token_cost: 6.25e-6,
    cache_read_input_token_cost: 5e-7,
    input_cost_per_token_above_200k_tokens: 1e-5,
    output_cost_per_token_above_200k_tokens: 5e-5,
    max_input_tokens: 1_000_000,
  });
  assert.equal(result.ok, true);
});

test('validateModelPricing rejects entry with no cost fields', () => {
  const result = validateModelPricing({ max_input_tokens: 200_000 });
  assert.equal(result.ok, false);
});

test('validateModelPricing rejects negative price', () => {
  const result = validateModelPricing({ input_cost_per_token: -1 });
  assert.equal(result.ok, false);
});

test('validateModelPricing rejects absurdly large price (>1e-3)', () => {
  const result = validateModelPricing({ input_cost_per_token: 1 });
  assert.equal(result.ok, false);
});

test('validateModelPricing rejects non-number price', () => {
  const result = validateModelPricing({ input_cost_per_token: '3e-6' as unknown as number });
  assert.equal(result.ok, false);
});

test('validateModelPricing rejects NaN / Infinity', () => {
  assert.equal(validateModelPricing({ input_cost_per_token: NaN }).ok, false);
  assert.equal(validateModelPricing({ input_cost_per_token: Infinity }).ok, false);
});

// ---------- filterClaudeModels ----------

test('filterClaudeModels keeps claude-* keys', () => {
  const input = {
    'claude-opus-4-7': { input_cost_per_token: 5e-6 },
    'claude-sonnet-4-6': { input_cost_per_token: 3e-6 },
  };
  const out = filterClaudeModels(input);
  assert.deepEqual(Object.keys(out).sort(), ['claude-opus-4-7', 'claude-sonnet-4-6']);
});

test('filterClaudeModels keeps anthropic/claude-* and anthropic.claude-*', () => {
  const input = {
    'anthropic/claude-opus-4-7': { input_cost_per_token: 5e-6 },
    'anthropic.claude-sonnet': { input_cost_per_token: 3e-6 },
  };
  const out = filterClaudeModels(input);
  assert.equal(Object.keys(out).length, 2);
});

test('filterClaudeModels drops non-Claude keys (gpt, gemini, etc.)', () => {
  const input = {
    'gpt-5': { input_cost_per_token: 1e-6 },
    'claude-opus-4-7': { input_cost_per_token: 5e-6 },
    'gemini-2.0-pro': { input_cost_per_token: 2e-6 },
  };
  const out = filterClaudeModels(input);
  assert.deepEqual(Object.keys(out), ['claude-opus-4-7']);
});

test('filterClaudeModels drops entries that fail schema validation', () => {
  const input = {
    'claude-bogus': { input_cost_per_token: 999 }, // above sanity bound
    'claude-ok': { input_cost_per_token: 5e-6 },
  };
  const out = filterClaudeModels(input);
  assert.deepEqual(Object.keys(out), ['claude-ok']);
});

// ---------- sanityCheckAgainstPrevious ----------

test('sanityCheckAgainstPrevious passes when nothing changes', () => {
  const prev = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  const next = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  assert.equal(sanityCheckAgainstPrevious(prev, next).ok, true);
});

test('sanityCheckAgainstPrevious passes on <10x change', () => {
  const prev = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  const next = { 'claude-opus-4-7': { input_cost_per_token: 15e-6 } };
  assert.equal(sanityCheckAgainstPrevious(prev, next).ok, true);
});

test('sanityCheckAgainstPrevious fails on >10x jump up', () => {
  const prev = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  const next = { 'claude-opus-4-7': { input_cost_per_token: 60e-6 } };
  assert.equal(sanityCheckAgainstPrevious(prev, next).ok, false);
});

test('sanityCheckAgainstPrevious fails on >10x drop down', () => {
  const prev = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  const next = { 'claude-opus-4-7': { input_cost_per_token: 4e-7 } };
  assert.equal(sanityCheckAgainstPrevious(prev, next).ok, false);
});

test('sanityCheckAgainstPrevious fails when a previously-known model disappears', () => {
  const prev = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  const next = {};
  assert.equal(sanityCheckAgainstPrevious(prev, next).ok, false);
});

test('sanityCheckAgainstPrevious allows new models (only existing ones are guarded)', () => {
  const prev = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  const next = {
    'claude-opus-4-7': { input_cost_per_token: 5e-6 },
    'claude-opus-5-future': { input_cost_per_token: 10e-6 },
  };
  assert.equal(sanityCheckAgainstPrevious(prev, next).ok, true);
});

test('sanityCheckAgainstPrevious tolerates previously-missing fields newly appearing', () => {
  const prev = { 'claude-opus-4-7': { input_cost_per_token: 5e-6 } };
  const next = {
    'claude-opus-4-7': { input_cost_per_token: 5e-6, cache_read_input_token_cost: 5e-7 },
  };
  assert.equal(sanityCheckAgainstPrevious(prev, next).ok, true);
});
