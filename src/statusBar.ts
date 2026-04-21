import * as vscode from 'vscode';
import { UsageData } from './types';
import { I18n } from './i18n';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private isLoading = false;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'claudeCodeUsage.showDetails';
    this.statusBarItem.show();
    this.updateStatusBar();
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.updateStatusBar();
  }

  updateUsageData(
    claudeTodayData: UsageData | null,
    codexTodayData: UsageData | null,
    error?: string,
  ): void {
    this.isLoading = false;

    if (error) {
      this.showError(error);
      return;
    }

    const hasClaude = this.hasProviderData(claudeTodayData);
    const hasCodex = this.hasProviderData(codexTodayData);

    if (!hasClaude && !hasCodex) {
      this.showNoData();
      return;
    }

    const parts: string[] = [];
    if (hasClaude && claudeTodayData) {
      parts.push(`$(pulse) ${I18n.formatCurrency(claudeTodayData.totalCost)}`);
    }
    if (hasCodex && codexTodayData) {
      parts.push(`$(zap) ${I18n.formatCurrency(codexTodayData.totalCost)}`);
    }

    this.statusBarItem.text = parts.join(' / ');
    this.statusBarItem.tooltip = this.createTooltip(claudeTodayData, codexTodayData);
    this.statusBarItem.backgroundColor = undefined;
  }

  private updateStatusBar(): void {
    if (this.isLoading) {
      this.statusBarItem.text = `$(sync~spin) ${I18n.t.statusBar.loading}`;
      this.statusBarItem.tooltip = I18n.t.statusBar.loading;
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  private hasProviderData(data: UsageData | null): boolean {
    if (!data) return false;
    return data.totalCost > 0;
  }

  private createProviderSection(
    title: string,
    data: UsageData,
    includeReasoning: boolean,
  ): string[] {
    const lines = [
      title,
      `${I18n.t.popup.cost}: ${I18n.formatCurrency(data.totalCost)}`,
      `${I18n.t.popup.inputTokens}: ${I18n.formatNumber(data.totalInputTokens)}`,
      `${I18n.t.popup.outputTokens}: ${I18n.formatNumber(data.totalOutputTokens)}`,
      `${I18n.t.popup.messages}: ${I18n.formatNumber(data.messageCount)}`,
    ];
    if (includeReasoning) {
      lines.push(`${I18n.t.reasoning.label}: ${I18n.formatNumber(data.totalReasoningTokens)}`);
    }
    return lines;
  }

  private createTooltip(claudeTodayData: UsageData | null, codexTodayData: UsageData | null): string {
    const sections: string[] = [];

    if (claudeTodayData && this.hasProviderData(claudeTodayData)) {
      sections.push(...this.createProviderSection(I18n.t.statusBar.claudeSection, claudeTodayData, false));
    }

    if (codexTodayData && this.hasProviderData(codexTodayData)) {
      if (sections.length > 0) {
        sections.push('');
      }
      sections.push(...this.createProviderSection(I18n.t.statusBar.codexSection, codexTodayData, true));
    }

    if (sections.length > 0) {
      sections.push('', I18n.t.popup.clickForDetails);
    }

    return sections.join('\n');
  }

  private showNoData(): void {
    this.statusBarItem.text = `$(circle-slash) ${I18n.t.statusBar.noData}`;
    this.statusBarItem.tooltip = I18n.t.statusBar.notRunning;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  private showError(error: string): void {
    this.statusBarItem.text = `$(error) ${I18n.t.statusBar.error}`;
    this.statusBarItem.tooltip = error;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
