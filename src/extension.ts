import * as vscode from 'vscode';
import { ClaudeDataLoader } from './dataLoader';
import { CodexDataLoader } from './codexDataLoader';
import { StatusBarManager } from './statusBar';
import { UsageWebviewProvider } from './webview';
import { I18n } from './i18n';
import { initPricing } from './pricing';
import { ClaudeUsageRecord, DashboardPayload, DatasetPayload, ExtensionConfig } from './types';

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
    resolvedDataDirectory?: string | null,
  ): Promise<{ records: ClaudeUsageRecord[]; dataDirectory: string | null }> {
    const dataDirectory =
      resolvedDataDirectory !== undefined
        ? resolvedDataDirectory
        : await ClaudeDataLoader.findClaudeDataDirectory(config.dataDirectory || undefined);
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
      const records = await CodexDataLoader.loadRecords(config, forceReload);
      this.cache.codex = {
        records,
        lastUpdate: new Date(),
        key: nextKey,
      };
    }

    return this.cache.codex.records;
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

  private computeDataset(records: ClaudeUsageRecord[]): DatasetPayload {
    return {
      sessionData: ClaudeDataLoader.getCurrentSessionData([...records]),
      todayData: ClaudeDataLoader.getTodayData(records),
      monthData: ClaudeDataLoader.getThisMonthData(records),
      allTimeData: ClaudeDataLoader.getAllTimeData(records),
      dailyDataForMonth: ClaudeDataLoader.getDailyDataForMonth(records),
      dailyDataForAllTime: ClaudeDataLoader.getDailyDataForAllTime(records),
      hourlyDataForToday: ClaudeDataLoader.getHourlyDataForToday(records),
    };
  }

  private async refreshData(forceReload = false): Promise<void> {
    let needLoading = false;
    let config = this.getConfiguration();
    let currentDataDirectory: string | null = null;
    try {
      this.statusBar.setLoading(true);
      config = this.getConfiguration();
      const resolvedClaudeDirectory = await ClaudeDataLoader.findClaudeDataDirectory(config.dataDirectory || undefined);
      currentDataDirectory = resolvedClaudeDirectory;
      const claudeKey = resolvedClaudeDirectory ?? this.getClaudeCacheKey(config);
      const codexKey = this.getCodexCacheKey(config);
      needLoading =
        forceReload ||
        this.shouldReload(this.cache.claude, claudeKey, false) ||
        this.shouldReload(this.cache.codex, codexKey, false);
      if (needLoading) {
        this.webviewProvider.setLoading(true);
      }

      const [claudeResult, codexRecords] = await Promise.all([
        this.loadClaudeRecords(config, forceReload, resolvedClaudeDirectory),
        this.loadCodexRecords(config, forceReload),
      ]);
      currentDataDirectory = claudeResult.dataDirectory;
      const claudeRecords = claudeResult.records;
      this.webviewProvider.setProviderRecords(claudeRecords, codexRecords);

      const claudeTodayData = ClaudeDataLoader.getTodayData(claudeRecords);
      const codexTodayData = ClaudeDataLoader.getTodayData(codexRecords);
      const payload: DashboardPayload = {
        claude: this.computeDataset(claudeRecords),
        codex: this.computeDataset(codexRecords),
        codexEnabled: config.codexEnabled,
        dataDirectory: claudeResult.dataDirectory,
        hasAnyData: claudeRecords.length > 0 || codexRecords.length > 0,
      };

      this.statusBar.updateUsageData(
        claudeTodayData,
        config.codexEnabled ? codexTodayData : null,
      );
      this.webviewProvider.updateData(payload);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.statusBar.updateUsageData(null, null, errorMessage);
      this.webviewProvider.setProviderRecords([], []);
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
      if (needLoading) {
        this.webviewProvider.setLoading(false);
      }
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
