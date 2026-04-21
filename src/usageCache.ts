import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { UsageData } from './types';

/**
 * 每个 JSONL 文件一条缓存条目：按日/按小时分桶的 UsageData。
 * 用 (mtimeMs, size) 当指纹——Claude/Codex 的 session 文件是 append-only，
 * 这两个字段任一变化就意味着"这个文件需要重新 parse"。
 */
export interface FileBucketEntry {
  mtimeMs: number;
  size: number;
  daily: Record<string, UsageData>; // "YYYY-MM-DD" → aggregated usage
  hourly: Record<string, UsageData>; // "YYYY-MM-DD:HH" → aggregated usage
}

export type CacheProvider = 'claude' | 'codex';

interface CacheDisk {
  version: number;
  pricingFingerprint: string;
  claude: Record<string, FileBucketEntry>;
  codex: Record<string, FileBucketEntry>;
}

const CACHE_FORMAT_VERSION = 2;
const CACHE_FILE_NAME = 'usage-cache.v2.json';

export class UsageCache {
  private constructor(
    private readonly filePath: string,
    private data: CacheDisk,
    private dirty: boolean,
  ) {}

  static async load(storageDir: string, pricingFingerprint: string): Promise<UsageCache> {
    // storageDir 首次不存在，主动建一下。recursive:true 让 EEXIST 不抛错。
    await mkdir(storageDir, { recursive: true });

    const filePath = path.join(storageDir, CACHE_FILE_NAME);

    let data: CacheDisk | null = null;
    try {
      const text = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(text) as CacheDisk;
      if (
        parsed.version === CACHE_FORMAT_VERSION &&
        parsed.pricingFingerprint === pricingFingerprint &&
        parsed.claude &&
        parsed.codex
      ) {
        data = parsed;
      }
    } catch {
      /* 不存在 / 损坏：回落到空缓存 */
    }

    if (!data) {
      data = {
        version: CACHE_FORMAT_VERSION,
        pricingFingerprint,
        claude: {},
        codex: {},
      };
      // 指纹变了就当整体作废；写回磁盘以防下次再被"识别到老指纹"
      return new UsageCache(filePath, data, true);
    }

    return new UsageCache(filePath, data, false);
  }

  getEntry(provider: CacheProvider, filePath: string): FileBucketEntry | undefined {
    return this.data[provider][filePath];
  }

  setEntry(provider: CacheProvider, filePath: string, entry: FileBucketEntry): void {
    this.data[provider][filePath] = entry;
    this.dirty = true;
  }

  /** 清掉缓存中 present 之外的条目（文件被删/移动时）。 */
  pruneMissing(provider: CacheProvider, presentFiles: Set<string>): void {
    for (const cachedPath of Object.keys(this.data[provider])) {
      if (!presentFiles.has(cachedPath)) {
        delete this.data[provider][cachedPath];
        this.dirty = true;
      }
    }
  }

  entries(provider: CacheProvider): Array<[string, FileBucketEntry]> {
    return Object.entries(this.data[provider]);
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    await writeFile(this.filePath, JSON.stringify(this.data), 'utf-8');
    this.dirty = false;
  }
}

/**
 * 合并两个 UsageData 桶：各字段相加，modelBreakdown 按 model 名合并。
 * 被多处调用，放在这里避免跨模块复制。
 */
export function mergeUsageInto(target: UsageData, source: UsageData): void {
  target.totalInputTokens += source.totalInputTokens;
  target.totalOutputTokens += source.totalOutputTokens;
  target.totalCacheCreationTokens += source.totalCacheCreationTokens;
  target.totalCacheReadTokens += source.totalCacheReadTokens;
  target.totalReasoningTokens += source.totalReasoningTokens;
  target.totalCost += source.totalCost;
  target.messageCount += source.messageCount;

  for (const [model, breakdown] of Object.entries(source.modelBreakdown)) {
    let targetModel = target.modelBreakdown[model];
    if (!targetModel) {
      targetModel = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        cost: 0,
        count: 0,
        provider: breakdown.provider,
      };
      target.modelBreakdown[model] = targetModel;
    }
    targetModel.inputTokens += breakdown.inputTokens;
    targetModel.outputTokens += breakdown.outputTokens;
    targetModel.cacheCreationTokens += breakdown.cacheCreationTokens;
    targetModel.cacheReadTokens += breakdown.cacheReadTokens;
    targetModel.reasoningTokens += breakdown.reasoningTokens;
    targetModel.cost += breakdown.cost;
    targetModel.count += breakdown.count;
  }
}

export function createEmptyUsage(): UsageData {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    totalReasoningTokens: 0,
    totalCost: 0,
    messageCount: 0,
    modelBreakdown: {},
  };
}
