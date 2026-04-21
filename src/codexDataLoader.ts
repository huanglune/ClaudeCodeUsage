import * as fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ClaudeUsageRecord, CodexUsageEventUsage, CodexUsageRecord, ExtensionConfig } from './types';
import { CacheProvider, UsageCache } from './usageCache';
import { MergedBuckets, computePerFileBuckets, mergeBuckets } from './dataLoader';

const CODEX_HOME_ENV = 'CODEX_HOME';
const DEFAULT_CODEX_HOME = path.join(os.homedir(), '.codex');
const CODEX_SESSIONS_DIR = 'sessions';
const CODEX_ARCHIVED_SESSIONS_DIR = 'archived_sessions';

export interface CodexParseState {
  currentModel: string | null;
  previousTotals: CodexTotals | null;
  sessionIsHeadless: boolean;
  sessionProvider: string;
  sessionAgent: string | null;
}

interface CachedClampResult {
  cached: number;
  freshInput: number;
}

export class CodexTotals {
  constructor(
    public readonly input: number,
    public readonly output: number,
    public readonly cached: number,
    public readonly reasoning: number,
  ) {}

  static fromUsage(usage: CodexUsageEventUsage | undefined): CodexTotals {
    if (!usage) {
      return new CodexTotals(0, 0, 0, 0);
    }
    const input = firstNumber(usage.input_tokens, usage.prompt_tokens, usage.input);
    const output = firstNumber(usage.output_tokens, usage.completion_tokens, usage.output);
    const cached = Math.max(
      safeNumber(usage.cached_input_tokens),
      safeNumber(usage.cache_read_input_tokens),
      safeNumber(usage.cached_tokens),
    );
    const reasoning = safeNumber(usage.reasoning_output_tokens);
    return new CodexTotals(input, output, cached, reasoning);
  }

  deltaFrom(previous: CodexTotals): CodexTotals {
    return new CodexTotals(
      saturatingSub(this.input, previous.input),
      saturatingSub(this.output, previous.output),
      saturatingSub(this.cached, previous.cached),
      saturatingSub(this.reasoning, previous.reasoning),
    );
  }

  saturatingAdd(other: CodexTotals): CodexTotals {
    return new CodexTotals(
      this.input + other.input,
      this.output + other.output,
      this.cached + other.cached,
      this.reasoning + other.reasoning,
    );
  }

  looksLikeStaleRegression(previous: CodexTotals, last: CodexTotals): boolean {
    const currentTotal = this.total();
    const previousTotal = previous.total();
    const lastTotal = last.total();
    return currentTotal * 100 >= previousTotal * 98 || currentTotal + 2 * lastTotal >= previousTotal;
  }

  isZero(): boolean {
    return this.total() === 0;
  }

  total(): number {
    return this.input + this.output + this.cached + this.reasoning;
  }

  intoTokens(): {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    reasoning_output_tokens: number;
  } {
    const clamped = CodexDataLoader.cachedClamp(this.input, this.cached);
    return {
      input_tokens: clamped.freshInput,
      output_tokens: this.output,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: clamped.cached,
      reasoning_output_tokens: this.reasoning,
    };
  }
}

function safeNumber(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return value;
}

function firstNumber(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 0 ? 0 : value;
    }
  }
  return 0;
}

function firstString(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
}

function saturatingSub(value: number, previous: number): number {
  return value > previous ? value - previous : 0;
}

export class CodexDataLoader {
  static getCodexPaths(dataDirectory?: string): string[] {
    if (dataDirectory && dataDirectory.trim().length > 0) {
      return [path.resolve(dataDirectory)];
    }

    const envPath = process.env[CODEX_HOME_ENV];
    if (envPath && envPath.trim().length > 0) {
      return [path.resolve(envPath)];
    }

    return [DEFAULT_CODEX_HOME];
  }

  static async findCodexJsonlFiles(basePath: string, includeArchived: boolean): Promise<string[]> {
    const roots = [path.join(basePath, CODEX_SESSIONS_DIR)];
    if (includeArchived) {
      roots.push(path.join(basePath, CODEX_ARCHIVED_SESSIONS_DIR));
    }

    const files: string[] = [];
    for (const root of roots) {
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        continue;
      }
      await this.walkForJsonl(root, files);
    }

    return files.sort();
  }

  private static async walkForJsonl(root: string, files: string[]): Promise<void> {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        await this.walkForJsonl(fullPath, files);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push(fullPath);
      }
    }
  }

  static cachedClamp(input: number, cached: number): CachedClampResult {
    const safeInput = safeNumber(input);
    const safeCached = safeNumber(cached);
    const clampedCached = Math.min(safeCached, safeInput);
    return {
      cached: clampedCached,
      freshInput: safeInput - clampedCached,
    };
  }

  /**
   * L2 cache-aware 加载：stat 每文件，未变的用缓存 bucket，变了的才 parse + 计算。
   * 返回 merged buckets 供 extension 物化视图/drilldown 使用。
   */
  static async loadBucketsWithCache(
    config: ExtensionConfig,
    cache: UsageCache,
    timeZone: string,
  ): Promise<{ merged: MergedBuckets; stats: { fileCount: number; missCount: number; hitCount: number } }> {
    const provider: CacheProvider = 'codex';
    if (!config.codexEnabled) {
      cache.pruneMissing(provider, new Set());
      return { merged: { daily: {}, hourly: {} }, stats: { fileCount: 0, missCount: 0, hitCount: 0 } };
    }

    const [basePath] = this.getCodexPaths(config.codexDataDirectory);
    if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory()) {
      cache.pruneMissing(provider, new Set());
      return { merged: { daily: {}, hourly: {} }, stats: { fileCount: 0, missCount: 0, hitCount: 0 } };
    }

    const files = await this.findCodexJsonlFiles(basePath, config.codexIncludeArchived);
    const presentSet = new Set(files);
    cache.pruneMissing(provider, presentSet);

    const stats = { fileCount: files.length, missCount: 0, hitCount: 0 };

    const missFiles: Array<{ file: string; mtimeMs: number; size: number }> = [];
    await Promise.all(
      files.map(async (file) => {
        try {
          const st = await fs.promises.stat(file);
          const existing = cache.getEntry(provider, file);
          if (existing && existing.mtimeMs === st.mtimeMs && existing.size === st.size) {
            stats.hitCount += 1;
            return;
          }
          missFiles.push({ file, mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          /* stat 失败：跳过 */
        }
      }),
    );
    stats.missCount = missFiles.length;

    const CONCURRENCY = 16;
    for (let i = 0; i < missFiles.length; i += CONCURRENCY) {
      const batch = missFiles.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async ({ file, mtimeMs, size }) => {
          try {
            const records = await this.parseCodexFile(file);
            const buckets = computePerFileBuckets(records, timeZone);
            cache.setEntry(provider, file, {
              mtimeMs,
              size,
              daily: buckets.daily,
              hourly: buckets.hourly,
            });
          } catch {
            cache.setEntry(provider, file, { mtimeMs, size, daily: {}, hourly: {} });
          }
        }),
      );
    }

    const merged: MergedBuckets = { daily: {}, hourly: {} };
    for (const [, entry] of cache.entries(provider)) {
      mergeBuckets(merged, entry);
    }

    return { merged, stats };
  }

  static async parseCodexFile(filePath: string): Promise<ClaudeUsageRecord[]> {
    const state: CodexParseState = {
      currentModel: null,
      previousTotals: null,
      sessionIsHeadless: false,
      sessionProvider: 'openai',
      sessionAgent: null,
    };
    const sessionId = path.basename(filePath, '.jsonl');
    const records: ClaudeUsageRecord[] = [];

    let content = '';
    try {
      content = await readFile(filePath, 'utf-8');
    } catch {
      return [];
    }

    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]?.trim();
      if (!line) continue;

      let entry: CodexUsageRecord;
      try {
        entry = JSON.parse(line) as CodexUsageRecord;
      } catch {
        continue;
      }

      const structured = this.parseStructuredEntry(entry, state, sessionId, lineIndex);
      if (structured) {
        records.push(structured);
        continue;
      }

      const fallback = this.parseCodexHeadlessLine(entry, state, sessionId, lineIndex);
      if (fallback) {
        records.push(fallback);
      }
    }

    return records;
  }

  private static parseStructuredEntry(
    entry: CodexUsageRecord,
    state: CodexParseState,
    sessionId: string,
    lineIndex: number,
  ): ClaudeUsageRecord | null {
    if (entry.type === 'session_meta') {
      const payload = entry.payload ?? {};
      state.sessionIsHeadless = payload.source === 'exec';
      state.sessionProvider = payload.model_provider ?? 'openai';
      state.sessionAgent = state.sessionIsHeadless ? 'headless' : payload.agent_nickname ?? state.sessionAgent;
      return null;
    }

    if (entry.type === 'turn_context') {
      const payload = entry.payload ?? {};
      const model = this.extractModelFromPayload(payload);
      if (model) {
        state.currentModel = model;
      }
      return null;
    }

    if (entry.type === 'event_msg' && entry.payload?.type === 'token_count') {
      return this.parseTokenCountEvent(entry, state, sessionId, lineIndex);
    }

    return null;
  }

  private static parseTokenCountEvent(
    entry: CodexUsageRecord,
    state: CodexParseState,
    sessionId: string,
    lineIndex: number,
  ): ClaudeUsageRecord | null {
    const payload = entry.payload ?? {};
    const totalUsage = payload.total_token_usage ?? payload.info?.total_token_usage;
    const lastUsage = payload.last_token_usage ?? payload.info?.last_token_usage;
    const total = totalUsage ? CodexTotals.fromUsage(totalUsage) : null;
    const last = lastUsage ? CodexTotals.fromUsage(lastUsage) : null;

    if (total == null && last == null) {
      return null;
    }

    const model = this.extractModelFromPayload(payload) ?? state.currentModel ?? 'unknown';
    if (model !== 'unknown') {
      state.currentModel = model;
    }

    let increment: CodexTotals | null = null;

    if (total && last) {
      if (total.isZero() && last.isZero()) {
        return null;
      }

      if (state.previousTotals == null) {
        increment = last;
        if (!total.isZero()) {
          state.previousTotals = total;
        }
      } else {
        const previous = state.previousTotals;
        const totalValue = total.total();
        const previousValue = previous.total();

        if (totalValue === previousValue) {
          return null;
        }

        if (totalValue < previousValue) {
          if (total.looksLikeStaleRegression(previous, last)) {
            return null;
          }
          increment = last;
          state.previousTotals = total;
        } else {
          increment = last;
          state.previousTotals = total;
        }
      }
    } else if (total) {
      if (total.isZero()) {
        return null;
      }
      if (state.previousTotals == null) {
        state.previousTotals = total;
        return null;
      }
      const previous = state.previousTotals;
      if (total.total() <= previous.total()) {
        return null;
      }
      increment = total.deltaFrom(previous);
      state.previousTotals = total;
    } else if (last) {
      increment = last;
    }

    if (!increment || increment.isZero()) {
      return null;
    }

    return this.createNormalizedRecord(
      entry.timestamp,
      model,
      increment,
      sessionId,
      lineIndex,
      state.sessionProvider,
      state.sessionIsHeadless ? 'headless' : state.sessionAgent,
    );
  }

  static parseCodexHeadlessLine(
    entry: CodexUsageRecord,
    state: CodexParseState,
    sessionId: string,
    lineIndex: number,
  ): ClaudeUsageRecord | null {
    const usage =
      entry.usage ??
      entry.data?.usage ??
      entry.result?.usage ??
      entry.response?.usage;
    if (!usage) {
      return null;
    }

    const totals = CodexTotals.fromUsage(usage);
    if (totals.isZero()) {
      return null;
    }

    const model = firstString(
      entry.model,
      entry.model_name,
      entry.data?.model,
      entry.data?.model_name,
      entry.result?.model,
      entry.result?.model_name,
      entry.response?.model,
      entry.response?.model_name,
      state.currentModel,
    ) ?? 'unknown';

    if (model !== 'unknown') {
      state.currentModel = model;
    }

    return this.createNormalizedRecord(
      entry.timestamp,
      model,
      totals,
      sessionId,
      lineIndex,
      state.sessionProvider || 'openai',
      state.sessionIsHeadless ? 'headless' : state.sessionAgent,
    );
  }

  private static createNormalizedRecord(
    timestamp: string | undefined,
    model: string,
    totals: CodexTotals,
    sessionId: string,
    lineIndex: number,
    provider: string,
    agent: string | null,
  ): ClaudeUsageRecord {
    const usage = totals.intoTokens();
    return {
      timestamp: safeTimestamp(timestamp),
      message: {
        usage: {
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cache_creation_input_tokens: usage.cache_creation_input_tokens,
          cache_read_input_tokens: usage.cache_read_input_tokens,
          reasoning_output_tokens: usage.reasoning_output_tokens,
        },
        model,
        id: `${sessionId}-${lineIndex + 1}`,
      },
      requestId: `${sessionId}-${lineIndex + 1}`,
      provider: 'codex',
      providerId: provider,
      agent: agent ?? undefined,
      costUSD: 0,
    };
  }

  private static extractModelFromPayload(payload: NonNullable<CodexUsageRecord['payload']>): string | null {
    return firstString(
      payload.model_info?.slug,
      payload.model,
      payload.model_name,
      payload.info?.model,
      payload.info?.model_name,
    );
  }
}

function safeTimestamp(timestamp: string | undefined): string {
  if (timestamp) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}
