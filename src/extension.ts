import * as vscode from 'vscode';
import { ClaudeDataLoader } from './dataLoader';
import { CodexDataLoader } from './codexDataLoader';
import { StatusBarManager } from './statusBar';
import { UsageWebviewProvider } from './webview';
import { I18n } from './i18n';
import { initPricing } from './pricing';
import { ClaudeUsageRecord, ExtensionConfig } from './types';

interface ProviderCache {
  records: ClaudeUsageRecord[];
  lastUpdate: Date;
  key: string | null;
}

export class ClaudeCodeUsageExtension {
  private statusBar: StatusBarManager;
  private webviewProvider: UsageWebviewProvider;
  private refreshTimer: NodeJS.Timeout | undefined;
  private cache: {
    claude: ProviderCache;
    codex: ProviderCache;
  } = {
    claude: {
      records: [],
      lastUpdate: new Date(0),
      key: null,
    },
    codex: {
      records: [],
      lastUpdate: new Date(0),
      key: null,
    },
  };

  constructor(private context: vscode.ExtensionContext) {
    this.statusBar = new StatusBarManager();
    this.webviewProvider = new UsageWebviewProvider(context);

    this.setupCommands();
    this.loadConfiguration();
    this.startAutoRefresh();
    void this.refreshData();
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
    };
  }

  private onConfigurationChanged(): void {
    const config = this.getConfiguration();
    I18n.setLanguage(config.language as any);
    this.startAutoRefresh();

    const claudeKey = this.getClaudeCacheKey(config);
    if (claudeKey !== this.cache.claude.key) {
      this.cache.claude = { records: [], lastUpdate: new Date(0), key: claudeKey };
    }

    const codexKey = this.getCodexCacheKey(config);
    if (codexKey !== this.cache.codex.key) {
      this.cache.codex = { records: [], lastUpdate: new Date(0), key: codexKey };
      CodexDataLoader.invalidateCache();
    }

    void this.refreshData(true);
  }

  private getClaudeCacheKey(config: ExtensionConfig): string {
    return config.dataDirectory || '__auto__';
  }

  private getCodexCacheKey(config: ExtensionConfig): string {
    return `${config.codexEnabled}|${config.codexIncludeArchived}|${config.codexDataDirectory || '__auto__'}`;
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

  private shouldReload(cache: ProviderCache, nextKey: string, forceReload: boolean): boolean {
    if (forceReload) return true;
    if (cache.key !== nextKey) return true;
    return Date.now() - cache.lastUpdate.getTime() > 60_000;
  }

  private async loadClaudeRecords(
    config: ExtensionConfig,
    forceReload: boolean,
  ): Promise<{ records: ClaudeUsageRecord[]; dataDirectory: string | null }> {
    const dataDirectory = await ClaudeDataLoader.findClaudeDataDirectory(config.dataDirectory || undefined);
    if (!dataDirectory) {
      this.cache.claude = {
        records: [],
        lastUpdate: new Date(),
        key: this.getClaudeCacheKey(config),
      };
      return { records: [], dataDirectory: null };
    }

    const nextKey = dataDirectory;
    if (this.shouldReload(this.cache.claude, nextKey, forceReload)) {
      const records = await ClaudeDataLoader.loadUsageRecords(dataDirectory);
      this.cache.claude = {
        records,
        lastUpdate: new Date(),
        key: nextKey,
      };
    }

    return { records: this.cache.claude.records, dataDirectory };
  }

  private async loadCodexRecords(config: ExtensionConfig, forceReload: boolean): Promise<ClaudeUsageRecord[]> {
    const nextKey = this.getCodexCacheKey(config);
    if (!config.codexEnabled) {
      this.cache.codex = {
        records: [],
        lastUpdate: new Date(),
        key: nextKey,
      };
      return [];
    }

    if (this.shouldReload(this.cache.codex, nextKey, forceReload)) {
      const records = await CodexDataLoader.loadRecords(config, true);
      this.cache.codex = {
        records,
        lastUpdate: new Date(),
        key: nextKey,
      };
    }

    return this.cache.codex.records;
  }

  private async refreshData(forceReload = false): Promise<void> {
    try {
      this.statusBar.setLoading(true);
      this.webviewProvider.setLoading(true);

      const config = this.getConfiguration();
      const [claudeResult, codexRecords] = await Promise.all([
        this.loadClaudeRecords(config, forceReload),
        this.loadCodexRecords(config, forceReload),
      ]);

      const claudeRecords = claudeResult.records;
      const mergedRecords = [...claudeRecords, ...codexRecords].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const claudeTodayData = ClaudeDataLoader.getTodayData(claudeRecords);
      const codexTodayData = ClaudeDataLoader.getTodayData(codexRecords);

      const sessionData = ClaudeDataLoader.getCurrentSessionData(mergedRecords);
      const todayData = ClaudeDataLoader.getTodayData(mergedRecords);
      const monthData = ClaudeDataLoader.getThisMonthData(mergedRecords);
      const allTimeData = ClaudeDataLoader.getAllTimeData(mergedRecords);
      const dailyDataForMonth = ClaudeDataLoader.getDailyDataForMonth(mergedRecords);
      const dailyDataForAllTime = ClaudeDataLoader.getDailyDataForAllTime(mergedRecords);
      const hourlyDataForToday = ClaudeDataLoader.getHourlyDataForToday(mergedRecords);

      if (mergedRecords.length === 0) {
        this.statusBar.updateUsageData(
          claudeTodayData,
          config.codexEnabled ? codexTodayData : null,
          'No usage records found. Make sure Claude Code or Codex is generating logs.',
        );
        this.webviewProvider.updateData(
          null,
          null,
          null,
          null,
          [],
          [],
          [],
          'No usage records found. Make sure Claude Code or Codex is generating logs.',
          claudeResult.dataDirectory,
          [],
        );
        return;
      }

      this.statusBar.updateUsageData(
        claudeTodayData,
        config.codexEnabled ? codexTodayData : null,
      );

      this.webviewProvider.updateData(
        sessionData,
        todayData,
        monthData,
        allTimeData,
        dailyDataForMonth,
        dailyDataForAllTime,
        hourlyDataForToday,
        undefined,
        claudeResult.dataDirectory,
        mergedRecords,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.statusBar.updateUsageData(null, null, errorMessage);
      this.webviewProvider.updateData(
        null,
        null,
        null,
        null,
        [],
        [],
        [],
        errorMessage,
        null,
        [],
      );
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
