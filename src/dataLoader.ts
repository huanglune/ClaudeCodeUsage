import * as fs from 'fs';
import { readFile } from 'node:fs/promises';
import * as os from 'os';
import * as path from 'path';
import { calculateCostFromTokens } from './pricing';
import { formatTzDateHour } from './timezone';
import { ClaudeUsageRecord, SessionData, UsageData } from './types';
import {
  CacheProvider,
  FileBucketEntry,
  UsageCache,
  createEmptyUsage,
  mergeUsageInto,
} from './usageCache';

const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';
const CLAUDE_PROJECTS_DIR_NAME = 'projects';
const DEFAULT_CLAUDE_CODE_PATH = '.claude';
const USER_HOME_DIR = os.homedir();
const XDG_CONFIG_DIR = process.env.XDG_CONFIG_HOME || path.join(USER_HOME_DIR, '.config');
const DEFAULT_CLAUDE_CONFIG_PATH = path.join(XDG_CONFIG_DIR, 'claude');

// 原本 zod 的最小替代，保证 JSON 行的 shape 符合 ClaudeUsageRecord。
function validateUsageRecord(data: any): data is ClaudeUsageRecord {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.timestamp !== 'string') return false;
  if (!data.message || typeof data.message !== 'object') return false;
  if (!data.message.usage || typeof data.message.usage !== 'object') return false;

  const usage = data.message.usage;
  if (typeof usage.input_tokens !== 'number') return false;
  if (typeof usage.output_tokens !== 'number') return false;
  if (usage.cache_creation_input_tokens !== undefined && typeof usage.cache_creation_input_tokens !== 'number') return false;
  if (usage.cache_read_input_tokens !== undefined && typeof usage.cache_read_input_tokens !== 'number') return false;

  if (data.message.model !== undefined && typeof data.message.model !== 'string') return false;
  if (data.message.id !== undefined && typeof data.message.id !== 'string') return false;
  if (data.costUSD !== undefined && typeof data.costUSD !== 'number') return false;
  if (data.requestId !== undefined && typeof data.requestId !== 'string') return false;
  if (data.isApiErrorMessage !== undefined && typeof data.isApiErrorMessage !== 'boolean') return false;

  return true;
}

export class ClaudeDataLoader {
  static getClaudePaths(): string[] {
    const paths: string[] = [];
    const normalizedPaths = new Set<string>();

    // 环境变量优先，支持逗号分隔的多条路径
    const envPaths = (process.env[CLAUDE_CONFIG_DIR_ENV] ?? '').trim();
    if (envPaths !== '') {
      const envPathList = envPaths
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== '');
      for (const envPath of envPathList) {
        const normalizedPath = path.resolve(envPath);
        if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isDirectory()) {
          const projectsPath = path.join(normalizedPath, CLAUDE_PROJECTS_DIR_NAME);
          if (fs.existsSync(projectsPath) && fs.statSync(projectsPath).isDirectory()) {
            if (!normalizedPaths.has(normalizedPath)) {
              normalizedPaths.add(normalizedPath);
              paths.push(normalizedPath);
            }
          }
        }
      }
    }

    const defaultPaths = [DEFAULT_CLAUDE_CONFIG_PATH, path.join(USER_HOME_DIR, DEFAULT_CLAUDE_CODE_PATH)];
    for (const defaultPath of defaultPaths) {
      const normalizedPath = path.resolve(defaultPath);
      if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isDirectory()) {
        const projectsPath = path.join(normalizedPath, CLAUDE_PROJECTS_DIR_NAME);
        if (fs.existsSync(projectsPath) && fs.statSync(projectsPath).isDirectory()) {
          if (!normalizedPaths.has(normalizedPath)) {
            normalizedPaths.add(normalizedPath);
            paths.push(normalizedPath);
          }
        }
      }
    }

    return paths;
  }

  static async findClaudeDataDirectory(customPath?: string): Promise<string | null> {
    if (customPath) {
      const projectsPath = path.join(customPath, CLAUDE_PROJECTS_DIR_NAME);
      if (fs.existsSync(projectsPath) && fs.statSync(projectsPath).isDirectory()) {
        return customPath;
      }
      return null;
    }

    const claudePaths = this.getClaudePaths();
    return claudePaths.length > 0 ? claudePaths[0] : null;
  }
}

export interface MergedBuckets {
  daily: Record<string, UsageData>;
  hourly: Record<string, UsageData>;
}

/** 把一段 records 摊到 per-file 的 daily / hourly 桶里（含 intra-file 去重）。 */
export function computePerFileBuckets(
  records: ClaudeUsageRecord[],
  timeZone: string,
): {
  daily: Record<string, UsageData>;
  hourly: Record<string, UsageData>;
} {
  const daily: Record<string, UsageData> = {};
  const hourly: Record<string, UsageData> = {};
  const seen = new Set<string>();

  for (const record of records) {
    if (!record.message.usage || !record.message.model) continue;
    const model = record.message.model;
    if (model === '<synthetic>' || record.isApiErrorMessage) continue;

    const usage = record.message.usage;
    const reasoningTokens = usage.reasoning_output_tokens || 0;
    const regularTokens =
      usage.input_tokens +
      usage.output_tokens +
      (usage.cache_creation_input_tokens || 0) +
      (usage.cache_read_input_tokens || 0);
    if (regularTokens + reasoningTokens === 0) continue;

    // intra-file 去重：同一条消息出现两次只算一次（Claude 日志可能有）
    const dedupKey =
      record.message.id && record.requestId ? `${record.message.id}:${record.requestId}` : null;
    if (dedupKey) {
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
    }

    const recordTime = new Date(record.timestamp);
    const tms = recordTime.getTime();
    if (Number.isNaN(tms)) continue;

    const { date: dateKey, hour } = formatTzDateHour(recordTime, timeZone);
    const hourKey = `${dateKey}:${hour}`;
    const provider: 'claude' | 'codex' = record.provider === 'codex' ? 'codex' : 'claude';
    const calculatedCost = calculateCostFromTokens(usage, model);

    if (!daily[dateKey]) daily[dateKey] = createEmptyUsage();
    if (!hourly[hourKey]) hourly[hourKey] = createEmptyUsage();

    for (const bucket of [daily[dateKey], hourly[hourKey]]) {
      bucket.totalInputTokens += usage.input_tokens;
      bucket.totalOutputTokens += usage.output_tokens;
      bucket.totalCacheCreationTokens += usage.cache_creation_input_tokens || 0;
      bucket.totalCacheReadTokens += usage.cache_read_input_tokens || 0;
      bucket.totalReasoningTokens += reasoningTokens;
      bucket.totalCost += calculatedCost;
      bucket.messageCount += 1;

      let modelData = bucket.modelBreakdown[model];
      if (!modelData) {
        modelData = {
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          reasoningTokens: 0,
          cost: 0,
          count: 0,
          provider,
        };
        bucket.modelBreakdown[model] = modelData;
      }
      modelData.inputTokens += usage.input_tokens;
      modelData.outputTokens += usage.output_tokens;
      modelData.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
      modelData.cacheReadTokens += usage.cache_read_input_tokens || 0;
      modelData.reasoningTokens += reasoningTokens;
      modelData.cost += calculatedCost;
      modelData.count += 1;
    }
  }

  return { daily, hourly };
}

/**
 * 只读 cache、不做 stat/parse，把所有 per-file entry merge 成 MergedBuckets。
 * 给 stale-while-revalidate 的 cache-first 首屏用。
 */
export function mergeAllCacheEntries(
  cache: { entries: (p: CacheProvider) => Array<[string, FileBucketEntry]> },
  provider: CacheProvider,
): MergedBuckets {
  const merged: MergedBuckets = { daily: {}, hourly: {} };
  for (const [, entry] of cache.entries(provider)) {
    mergeBuckets(merged, entry);
  }
  return merged;
}

/** 把 per-file buckets 合并进全局 merged buckets。 */
export function mergeBuckets(into: MergedBuckets, entry: FileBucketEntry): void {
  for (const [date, data] of Object.entries(entry.daily)) {
    if (!into.daily[date]) into.daily[date] = createEmptyUsage();
    mergeUsageInto(into.daily[date], data);
  }
  for (const [hour, data] of Object.entries(entry.hourly)) {
    if (!into.hourly[hour]) into.hourly[hour] = createEmptyUsage();
    mergeUsageInto(into.hourly[hour], data);
  }
}

/** 从 merged buckets + 当前时间物化出 DatasetPayload 需要的 7 种视图。 */
export function materializeDataset(
  merged: MergedBuckets,
  timeZone: string,
): {
  sessionData: SessionData | null;
  todayData: UsageData;
  monthData: UsageData;
  allTimeData: UsageData;
  dailyDataForMonth: { date: string; data: UsageData }[];
  dailyDataForAllTime: { date: string; data: UsageData }[];
  hourlyDataForToday: { hour: string; data: UsageData }[];
} {
  const { date: todayKey } = formatTzDateHour(new Date(), timeZone);
  const thisMonthPrefix = todayKey.slice(0, 7);

  const todayData = merged.daily[todayKey] ? cloneUsage(merged.daily[todayKey]) : createEmptyUsage();
  const monthData = createEmptyUsage();
  const allTimeData = createEmptyUsage();
  const dailyDataForMonth: { date: string; data: UsageData }[] = [];
  const monthlyAcc: Record<string, UsageData> = {};

  for (const [date, data] of Object.entries(merged.daily)) {
    mergeUsageInto(allTimeData, data);
    const monthPart = date.slice(0, 7);
    if (!monthlyAcc[monthPart]) monthlyAcc[monthPart] = createEmptyUsage();
    mergeUsageInto(monthlyAcc[monthPart], data);
    if (monthPart === thisMonthPrefix) {
      mergeUsageInto(monthData, data);
      dailyDataForMonth.push({ date, data });
    }
  }
  dailyDataForMonth.sort((a, b) => b.date.localeCompare(a.date));

  const dailyDataForAllTime = Object.entries(monthlyAcc)
    .map(([month, data]) => ({ date: `${month}-01`, data }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const hourlyDataForToday: { hour: string; data: UsageData }[] = [];
  const todayPrefix = `${todayKey}:`;
  for (const [key, data] of Object.entries(merged.hourly)) {
    if (key.startsWith(todayPrefix)) {
      hourlyDataForToday.push({ hour: `${key.slice(todayPrefix.length)}:00`, data });
    }
  }
  hourlyDataForToday.sort((a, b) => a.hour.localeCompare(b.hour));

  return {
    sessionData: null, // L2 已不再计算 session（webview 当前未使用）
    todayData,
    monthData,
    allTimeData,
    dailyDataForMonth,
    dailyDataForAllTime,
    hourlyDataForToday,
  };
}

/** drilldown：某天的按小时切片。 */
export function hourlyForDateFromBuckets(
  merged: MergedBuckets,
  dateString: string,
): { hour: string; data: UsageData }[] {
  const prefix = `${dateString}:`;
  const out: { hour: string; data: UsageData }[] = [];
  for (const [key, data] of Object.entries(merged.hourly)) {
    if (key.startsWith(prefix)) {
      out.push({ hour: `${key.slice(prefix.length)}:00`, data });
    }
  }
  out.sort((a, b) => a.hour.localeCompare(b.hour));
  return out;
}

/** drilldown：某月的按天切片（monthDateString 形如 "YYYY-MM-01"）。 */
export function dailyForMonthFromBuckets(
  merged: MergedBuckets,
  monthDateString: string,
): { date: string; data: UsageData }[] {
  const prefix = `${monthDateString.slice(0, 7)}-`;
  const out: { date: string; data: UsageData }[] = [];
  for (const [date, data] of Object.entries(merged.daily)) {
    if (date.startsWith(prefix)) {
      out.push({ date, data });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function cloneUsage(u: UsageData): UsageData {
  const res = createEmptyUsage();
  mergeUsageInto(res, u);
  return res;
}

/**
 * Cache-aware Claude 文件加载：
 *   1. 递归扫描 JSONL 文件
 *   2. stat 每个文件，(mtimeMs, size) 命中就用缓存 bucket
 *   3. miss 的 parse + 计算 per-file buckets 写回缓存
 *   4. prune 缓存里已消失的文件
 *   5. merge 出 MergedBuckets
 */
export async function loadClaudeBucketsWithCache(
  dataDirectory: string,
  cache: UsageCache,
  timeZone: string,
): Promise<{ merged: MergedBuckets; stats: { fileCount: number; missCount: number; hitCount: number } }> {
  const provider: CacheProvider = 'claude';
  const claudeDir = path.join(dataDirectory, CLAUDE_PROJECTS_DIR_NAME);
  if (!fs.existsSync(claudeDir)) {
    return { merged: { daily: {}, hourly: {} }, stats: { fileCount: 0, missCount: 0, hitCount: 0 } };
  }

  const allFiles: string[] = [];
  await collectJsonlFiles(claudeDir, allFiles);
  const presentSet = new Set(allFiles);
  cache.pruneMissing(provider, presentSet);

  const stats = { fileCount: allFiles.length, missCount: 0, hitCount: 0 };

  const missFiles: Array<{ file: string; mtimeMs: number; size: number }> = [];
  await Promise.all(
    allFiles.map(async (file) => {
      try {
        const st = await fs.promises.stat(file);
        const existing = cache.getEntry(provider, file);
        if (existing && existing.mtimeMs === st.mtimeMs && existing.size === st.size) {
          stats.hitCount += 1;
          return;
        }
        missFiles.push({ file, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        /* 文件消失或无权限，跳过 */
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
          const records = await parseClaudeJsonlRecords(file);
          const buckets = computePerFileBuckets(records, timeZone);
          cache.setEntry(provider, file, { mtimeMs, size, daily: buckets.daily, hourly: buckets.hourly });
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

async function parseClaudeJsonlRecords(file: string): Promise<ClaudeUsageRecord[]> {
  const content = await readFile(file, 'utf-8');
  const lines = content
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '');
  const out: ClaudeUsageRecord[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!validateUsageRecord(parsed)) continue;
      out.push({ ...(parsed as ClaudeUsageRecord), provider: 'claude' });
    } catch {
      /* 跳过单行解析错误 */
    }
  }
  return out;
}

async function collectJsonlFiles(root: string, sink: string[]): Promise<void> {
  try {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const p = path.join(root, entry.name);
        if (entry.isDirectory()) {
          await collectJsonlFiles(p, sink);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          sink.push(p);
        }
      }),
    );
  } catch {
    /* 忽略权限错误 */
  }
}
