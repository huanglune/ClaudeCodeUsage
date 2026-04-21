import * as vscode from 'vscode';
import {
  ClaudeDataLoader,
  MergedBuckets,
  loadClaudeBucketsWithCache,
  materializeDataset,
  mergeAllCacheEntries,
} from './dataLoader';
import { CodexDataLoader } from './codexDataLoader';
import { StatusBarManager } from './statusBar';
import { UsageWebviewProvider } from './webview';
import { I18n } from './i18n';
import { initPricing, getPricingFingerprint } from './pricing';
import { resolveTimeZone } from './timezone';
import { DashboardPayload, DatasetPayload, ExtensionConfig } from './types';
import { UsageCache } from './usageCache';

export class ClaudeCodeUsageExtension {
  private statusBar: StatusBarManager;
  private webviewProvider: UsageWebviewProvider;
  private refreshTimer: NodeJS.Timeout | undefined;
  private outputChannel: vscode.OutputChannel;
  private usageCache: UsageCache | null = null;
  private cacheFingerprint: string | null = null;
  private lastBuckets: { claude: MergedBuckets; codex: MergedBuckets } = {
    claude: { daily: {}, hourly: {} },
    codex: { daily: {}, hourly: {} },
  };

  constructor(private context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('Claude Code Usage');
    context.subscriptions.push(this.outputChannel);

    this.statusBar = new StatusBarManager();
    this.webviewProvider = new UsageWebviewProvider(context);

    this.setupCommands();
    this.loadConfiguration();
    this.startAutoRefresh();
    void this.bootstrapFromCache();
  }

  /**
   * Cache-first 首屏（stale-while-revalidate）：
   *   1. 立即从 UsageCache 物化上次的数据推给 UI → 用户感知"秒开"
   *   2. 再跑一次正常 refreshData 做增量刷新 → UI 更新为当前值
   * 如果缓存为空（首次安装 / 指纹失效），直接走正常 refreshData。
   */
  private async bootstrapFromCache(): Promise<void> {
    const tStart = Date.now();
    try {
      const cache = await this.ensureCache();
      const claudeBuckets = mergeAllCacheEntries(cache, 'claude');
      const codexBuckets = mergeAllCacheEntries(cache, 'codex');
      const hasStale =
        Object.keys(claudeBuckets.daily).length > 0 ||
        Object.keys(codexBuckets.daily).length > 0;

      if (hasStale) {
        const config = this.getConfiguration();
        const resolvedTz = resolveTimeZone(config.timezone);
        this.lastBuckets = { claude: claudeBuckets, codex: codexBuckets };
        this.webviewProvider.setProviderBuckets(claudeBuckets, codexBuckets);

        const claudeDataset = materializeDataset(claudeBuckets, resolvedTz);
        const codexDataset = materializeDataset(codexBuckets, resolvedTz);

        this.statusBar.updateUsageData(
          claudeDataset.todayData,
          config.codexEnabled ? codexDataset.todayData : null,
        );
        this.webviewProvider.updateData({
          claude: claudeDataset,
          codex: codexDataset,
          codexEnabled: config.codexEnabled,
          dataDirectory: null, // fresh 阶段会补上真实路径
          hasAnyData: true,
        });

        this.outputChannel.appendLine(
          `[${new Date().toISOString()}] bootstrap=${Date.now() - tStart}ms stale-hit claude_days=${Object.keys(claudeBuckets.daily).length} codex_days=${Object.keys(codexBuckets.daily).length}`,
        );
      } else {
        this.outputChannel.appendLine(
          `[${new Date().toISOString()}] bootstrap=${Date.now() - tStart}ms no-cache (first run or fingerprint changed)`,
        );
      }
    } catch (err) {
      this.outputChannel.appendLine(
        `[${new Date().toISOString()}] bootstrap error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 无论 cache 是否命中，都跑一次正常 refreshData 做 freshness check
    await this.refreshData();
  }

  private setupCommands(): void {
    const commands = [
      vscode.commands.registerCommand('claudeCodeUsage.refresh', () => {
        void this.refreshData(true);
      }),
      vscode.commands.registerCommand('claudeCodeUsage.showDetails', () => {
        this.webviewProvider.show();
      }),
      vscode.commands.registerCommand('claudeCodeUsage.openSettings', () => {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'claudeCodeUsage');
      }),
      vscode.commands.registerCommand('claudeCodeUsage.showLogs', () => {
        this.outputChannel.show();
      }),
    ];

    commands.forEach((command) => this.context.subscriptions.push(command));
  }

  private loadConfiguration(): void {
    const config = this.getConfiguration();
    I18n.setLanguage(config.language as any);

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('claudeCodeUsage')) {
          this.onConfigurationChanged();
        }
      }),
    );
  }

  private getConfiguration(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration('claudeCodeUsage');
    return {
      refreshInterval: config.get('refreshInterval', 60),
      dataDirectory: config.get('dataDirectory', ''),
      codexEnabled: config.get('codex.enabled', true),
      codexIncludeArchived: config.get('codex.includeArchived', false),
      codexDataDirectory: config.get('codex.dataDirectory', ''),
      language: config.get('language', 'auto'),
      decimalPlaces: config.get('decimalPlaces', 2),
      timezone: config.get('timezone', 'auto'),
    };
  }

  private onConfigurationChanged(): void {
    const previousLanguage = I18n.getCurrentLanguage();
    const config = this.getConfiguration();
    I18n.setLanguage(config.language as any);
    const currentLanguage = I18n.getCurrentLanguage();
    if (previousLanguage !== currentLanguage) {
      // The webview dictionary is injected at skeleton install time, so language changes
      // should recreate the panel and re-install HTML through the normal show() path.
      this.webviewProvider.handleLanguageChanged();
    }
    this.startAutoRefresh();
    // UsageCache 是 per-file (mtime, size) 自动失效的，配置改变不用手动清缓存。
    void this.refreshData(true);
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    const config = this.getConfiguration();
    const intervalMs = Math.max(config.refreshInterval * 1000, 30_000);
    this.refreshTimer = setInterval(() => {
      void this.refreshData();
    }, intervalMs);
  }

  private createEmptyDataset(): DatasetPayload {
    return {
      sessionData: null,
      todayData: null,
      monthData: null,
      allTimeData: null,
      dailyDataForMonth: [],
      dailyDataForAllTime: [],
      hourlyDataForToday: [],
    };
  }

  private async ensureCache(): Promise<UsageCache> {
    const config = this.getConfiguration();
    const resolvedTz = resolveTimeZone(config.timezone);
    const fingerprint = `${getPricingFingerprint()}|tz=${resolvedTz}`;
    if (this.usageCache && this.cacheFingerprint === fingerprint) {
      return this.usageCache;
    }
    this.usageCache = await UsageCache.load(this.context.globalStorageUri.fsPath, fingerprint);
    this.cacheFingerprint = fingerprint;
    return this.usageCache;
  }

  private async refreshData(_forceReload = false): Promise<void> {
    let config = this.getConfiguration();
    let currentDataDirectory: string | null = null;
    // 有 stale 数据（bootstrap 已经推过 UI）时不把 status bar 切成 spinner，
    // 避免 stale → spinner → fresh 的闪烁。webview 侧自带 lastPayload 守卫，直接调即可。
    const hasStaleData =
      Object.keys(this.lastBuckets.claude.daily).length > 0 ||
      Object.keys(this.lastBuckets.codex.daily).length > 0;
    this.webviewProvider.setLoading(true);
    if (!hasStaleData) {
      this.statusBar.setLoading(true);
    }
    try {
      config = this.getConfiguration();
      const resolvedTz = resolveTimeZone(config.timezone);
      const cache = await this.ensureCache();

      const resolvedClaudeDirectory = await ClaudeDataLoader.findClaudeDataDirectory(
        config.dataDirectory || undefined,
      );
      currentDataDirectory = resolvedClaudeDirectory;

      const tLoadStart = Date.now();
      const [claudeLoad, codexLoad] = await Promise.all([
        resolvedClaudeDirectory
          ? loadClaudeBucketsWithCache(resolvedClaudeDirectory, cache, resolvedTz)
          : Promise.resolve({
              merged: { daily: {}, hourly: {} } as MergedBuckets,
              stats: { fileCount: 0, missCount: 0, hitCount: 0 },
            }),
        CodexDataLoader.loadBucketsWithCache(config, cache, resolvedTz),
      ]);
      const tLoadEnd = Date.now();

      this.lastBuckets = { claude: claudeLoad.merged, codex: codexLoad.merged };
      this.webviewProvider.setProviderBuckets(claudeLoad.merged, codexLoad.merged);

      const tComputeStart = Date.now();
      const claudeDataset = materializeDataset(claudeLoad.merged, resolvedTz);
      const codexDataset = materializeDataset(codexLoad.merged, resolvedTz);
      const tComputeEnd = Date.now();

      // 异步写回 cache，不阻塞 UI 更新
      void cache.save().catch(() => {
        /* 写缓存失败不影响用户；下次再试 */
      });

      const hasAnyData =
        Object.keys(claudeLoad.merged.daily).length > 0 ||
        Object.keys(codexLoad.merged.daily).length > 0;
      const payload: DashboardPayload = {
        claude: claudeDataset,
        codex: codexDataset,
        codexEnabled: config.codexEnabled,
        dataDirectory: resolvedClaudeDirectory,
        hasAnyData,
      };

      this.statusBar.updateUsageData(
        claudeDataset.todayData,
        config.codexEnabled ? codexDataset.todayData : null,
      );
      this.webviewProvider.updateData(payload);

      this.outputChannel.appendLine(
        `[${new Date().toISOString()}] load=${tLoadEnd - tLoadStart}ms compute=${tComputeEnd - tComputeStart}ms files(claude=${claudeLoad.stats.fileCount} hit=${claudeLoad.stats.hitCount} miss=${claudeLoad.stats.missCount}) files(codex=${codexLoad.stats.fileCount} hit=${codexLoad.stats.hitCount} miss=${codexLoad.stats.missCount})`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: ${errorMessage}`);
      if (error instanceof Error && error.stack) {
        this.outputChannel.appendLine(error.stack);
      }
      this.statusBar.updateUsageData(null, null, errorMessage);
      const empty: MergedBuckets = { daily: {}, hourly: {} };
      this.webviewProvider.setProviderBuckets(empty, empty);
      const errorPayload: DashboardPayload = {
        claude: this.createEmptyDataset(),
        codex: this.createEmptyDataset(),
        codexEnabled: config.codexEnabled,
        dataDirectory: currentDataDirectory,
        hasAnyData: false,
        error: errorMessage,
      };
      this.webviewProvider.updateData(errorPayload);
    } finally {
      this.webviewProvider.setLoading(false);
      this.statusBar.setLoading(false);
    }
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.statusBar.dispose();
    this.webviewProvider.dispose();
  }
}

export async function activate(context: vscode.ExtensionContext) {
  await initPricing(context);
  const extension = new ClaudeCodeUsageExtension(context);
  context.subscriptions.push({
    dispose: () => extension.dispose(),
  });
}

export function deactivate() {
  // no-op
}
