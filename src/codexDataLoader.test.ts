import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { CodexDataLoader, CodexTotals } from './codexDataLoader';

function tokenEvent(
  timestamp: string,
  total?: Record<string, number>,
  last?: Record<string, number>,
  extraPayload: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'event_msg',
    timestamp,
    payload: {
      type: 'token_count',
      ...(total ? { total_token_usage: total } : {}),
      ...(last ? { last_token_usage: last } : {}),
      ...extraPayload,
    },
  };
}

async function parseLines(lines: Array<Record<string, unknown>>): Promise<Awaited<ReturnType<typeof CodexDataLoader.parseCodexFile>>> {
  const dir = await mkdtemp(path.join(tmpdir(), 'codex-loader-test-'));
  const file = path.join(dir, 'rollout-test.jsonl');
  try {
    await writeFile(file, lines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf-8');
    return await CodexDataLoader.parseCodexFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('uses_total_deltas_when_totals_repeat', async () => {
  const records = await parseLines([
    { type: 'turn_context', payload: { model: 'gpt-5.4' } },
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 100 }, { input_tokens: 10 }),
    tokenEvent('2026-04-20T00:01:00.000Z', { input_tokens: 100 }, { input_tokens: 9 }),
    tokenEvent('2026-04-20T00:02:00.000Z', { input_tokens: 100 }, { input_tokens: 8 }),
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.usage.input_tokens, 10);
});

test('falls_back_to_last_usage_when_totals_reset', async () => {
  const records = await parseLines([
    { type: 'turn_context', payload: { model: 'gpt-5.4' } },
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 10000 }, { input_tokens: 10 }),
    tokenEvent('2026-04-20T00:01:00.000Z', { input_tokens: 7600 }, { input_tokens: 25 }),
  ]);

  assert.equal(records.length, 2);
  assert.equal(records[1].message.usage.input_tokens, 25);
});

test('avoids_double_counting_stale_cumulative_regressions', async () => {
  const records = await parseLines([
    { type: 'turn_context', payload: { model: 'gpt-5.4' } },
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 110 }, { input_tokens: 10 }),
    tokenEvent('2026-04-20T00:01:00.000Z', { input_tokens: 109 }, { input_tokens: 9 }),
    tokenEvent('2026-04-20T00:02:00.000Z', { input_tokens: 120 }, { input_tokens: 11 }),
  ]);

  assert.equal(records.length, 2);
  assert.equal(records[0].message.usage.input_tokens, 10);
  assert.equal(records[1].message.usage.input_tokens, 11);
});

test('compaction_total_drop_uses_last_as_increment', async () => {
  const records = await parseLines([
    { type: 'turn_context', payload: { model: 'gpt-5.4' } },
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 150000 }, { input_tokens: 10 }),
    tokenEvent('2026-04-20T00:01:00.000Z', { input_tokens: 200000 }, { input_tokens: 50 }),
  ]);

  assert.equal(records.length, 2);
  assert.equal(records[1].message.usage.input_tokens, 50);
});

test('zero_token_snapshot_does_not_inflate_later_deltas', async () => {
  const records = await parseLines([
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 10 }, undefined),
    tokenEvent('2026-04-20T00:01:00.000Z', { input_tokens: 0 }, undefined),
    tokenEvent('2026-04-20T00:02:00.000Z', { input_tokens: 20 }, undefined),
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.usage.input_tokens, 10);
});

test('into_tokens_clamps_cached_to_input', () => {
  const tokens = new CodexTotals(50, 0, 100, 0).intoTokens();
  assert.equal(tokens.cache_read_input_tokens, 50);
  assert.equal(tokens.input_tokens, 0);
});

test('first_event_uses_last_not_total_for_resumed_sessions', async () => {
  const records = await parseLines([
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 5000 }, { input_tokens: 12 }),
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.usage.input_tokens, 12);
});

test('headless_usage_line', async () => {
  const records = await parseLines([
    {
      type: 'turn.completed',
      timestamp: '2026-04-20T00:00:00.000Z',
      model: 'gpt-4o-mini',
      usage: {
        input_tokens: 120,
        cached_input_tokens: 20,
        output_tokens: 30,
      },
    },
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.model, 'gpt-4o-mini');
  assert.equal(records[0].message.usage.input_tokens, 100);
  assert.equal(records[0].message.usage.cache_read_input_tokens, 20);
  assert.equal(records[0].message.usage.output_tokens, 30);
});

test('headless_usage_nested_data', async () => {
  const records = await parseLines([
    {
      type: 'result',
      timestamp: '2026-04-20T00:00:00.000Z',
      data: {
        model_name: 'gpt-4o',
        usage: {
          input_tokens: 50,
          cached_input_tokens: 5,
          output_tokens: 12,
        },
      },
    },
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.model, 'gpt-4o');
  assert.equal(records[0].message.usage.input_tokens, 45);
  assert.equal(records[0].message.usage.cache_read_input_tokens, 5);
  assert.equal(records[0].message.usage.output_tokens, 12);
});

test('model_info_slug_from_turn_context', async () => {
  const records = await parseLines([
    { type: 'turn_context', payload: { model_info: { slug: 'gpt-5.4' } } },
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 10 }, { input_tokens: 2 }),
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.model, 'gpt-5.4');
});

test('session_meta_provider_and_agent', async () => {
  const records = await parseLines([
    { type: 'session_meta', payload: { model_provider: 'azure', agent_nickname: 'my-bot' } },
    { type: 'turn_context', payload: { model: 'gpt-4o' } },
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 10 }, { input_tokens: 2 }),
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].provider, 'codex');
  assert.equal(records[0].providerId, 'azure');
  assert.equal(records[0].agent, 'my-bot');
});

test('extract_model_skips_empty_slug_falls_through_to_model', async () => {
  const records = await parseLines([
    { type: 'turn_context', payload: { model_info: { slug: '' }, model: 'gpt-4o' } },
    tokenEvent('2026-04-20T00:00:00.000Z', { input_tokens: 10 }, { input_tokens: 2 }),
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.model, 'gpt-4o');
});

test('token_count_info_nested_usage_is_parsed', async () => {
  const records = await parseLines([
    { type: 'turn_context', payload: { model: 'gpt-5.3-codex' } },
    {
      type: 'event_msg',
      timestamp: '2026-04-20T00:00:00.000Z',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 120,
            cached_input_tokens: 20,
            output_tokens: 30,
            reasoning_output_tokens: 10,
          },
          last_token_usage: {
            input_tokens: 120,
            cached_input_tokens: 20,
            output_tokens: 30,
            reasoning_output_tokens: 10,
          },
        },
      },
    },
  ]);

  assert.equal(records.length, 1);
  assert.equal(records[0].message.model, 'gpt-5.3-codex');
  assert.equal(records[0].message.usage.input_tokens, 100);
  assert.equal(records[0].message.usage.cache_read_input_tokens, 20);
  assert.equal(records[0].message.usage.output_tokens, 30);
  assert.equal(records[0].message.usage.reasoning_output_tokens, 10);
});
