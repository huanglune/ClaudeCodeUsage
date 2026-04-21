import * as vscode from 'vscode';
import { ClaudeDataLoader } from './dataLoader';
import { I18n } from './i18n';
import {
  ClaudeUsageRecord,
  DashboardPayload,
  HostToWebviewMessage,
} from './types';

type Provider = 'claude' | 'codex';
type PeriodTab = 'today' | 'month' | 'all';

export class UsageWebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private isLoading = false;
  private lastPayload: DashboardPayload | null = null;
  private currentTab: PeriodTab = 'today';
  private providerTab: Provider = 'claude';
  private providerRecords: Record<Provider, ClaudeUsageRecord[]> = {
    claude: [],
    codex: [],
  };

  constructor(private context: vscode.ExtensionContext) {
    this.providerTab = this.context.workspaceState.get<Provider>(
      'claudeCodeUsage.providerTab',
      'claude',
    );
  }

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'claudeCodeUsage',
      I18n.t.popup.title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((message: any) => {
      this.handleWebviewMessage(message);
    });

    this.panel.webview.html = this.buildSkeletonHtml();
    this.syncWebviewState();
  }

  handleLanguageChanged(): void {
    if (!this.panel) {
      return;
    }

    const wasVisible = this.panel.visible;
    this.panel.dispose();

    if (wasVisible) {
      this.show();
    }
  }

  setProviderRecords(claudeRecords: ClaudeUsageRecord[], codexRecords: ClaudeUsageRecord[]): void {
    this.providerRecords = {
      claude: claudeRecords,
      codex: codexRecords,
    };
  }

  updateData(payload: DashboardPayload): void {
    this.lastPayload = payload;
    this.postMessage({ command: 'updateData', payload });
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.postMessage({ command: 'setLoading', loading });
  }

  private postMessage(message: HostToWebviewMessage): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage(message);
  }

  private syncWebviewState(): void {
    if (this.lastPayload) {
      this.postMessage({ command: 'updateData', payload: this.lastPayload });
    }
    this.postMessage({ command: 'setLoading', loading: this.isLoading });
  }

  private handleWebviewMessage(message: any): void {
    switch (message.command) {
      case 'refresh':
        void vscode.commands.executeCommand('claudeCodeUsage.refresh');
        break;
      case 'openSettings':
        void vscode.commands.executeCommand('claudeCodeUsage.openSettings');
        break;
      case 'tabChanged': {
        if (message.tab === 'today' || message.tab === 'month' || message.tab === 'all') {
          this.currentTab = message.tab;
        }
        break;
      }
      case 'providerChanged': {
        if (message.provider === 'claude' || message.provider === 'codex') {
          this.providerTab = message.provider;
          void this.context.workspaceState.update('claudeCodeUsage.providerTab', this.providerTab);
        }
        break;
      }
      case 'getHourlyData': {
        const dateString = typeof message.date === 'string' ? message.date : '';
        if (!dateString || !this.panel) {
          return;
        }

        const hourlyData = ClaudeDataLoader.getHourlyDataForDate(
          this.providerRecords[this.providerTab],
          dateString,
        );

        void this.panel.webview.postMessage({
          command: 'hourlyDataResponse',
          date: dateString,
          data: hourlyData,
        });
        break;
      }
      case 'getDailyData': {
        const monthString = typeof message.month === 'string' ? message.month : '';
        if (!monthString || !this.panel) {
          return;
        }

        const dailyData = ClaudeDataLoader.getDailyDataForSpecificMonth(
          this.providerRecords[this.providerTab],
          monthString,
        );

        void this.panel.webview.postMessage({
          command: 'dailyDataResponse',
          month: monthString,
          data: dailyData,
        });
        break;
      }
      case 'ready':
        // Webview notifies when script is ready to receive messages.
        // Re-sync latest state to avoid message-race issues during initial load.
        this.syncWebviewState();
        break;
      default:
        break;
    }
  }

  private buildSkeletonHtml(): string {
    const decimalPlaces = vscode.workspace
      .getConfiguration('claudeCodeUsage')
      .get<number>('decimalPlaces', 2);

    const bootstrap = JSON.stringify({
      t: I18n.t,
      decimalPlaces,
      language: I18n.getCurrentLanguage(),
    }).replace(/</g, '\\u003c');

    const todayActive = this.currentTab === 'today' ? 'active' : '';
    const monthActive = this.currentTab === 'month' ? 'active' : '';
    const allActive = this.currentTab === 'all' ? 'active' : '';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${I18n.t.popup.title}</title>
        <style>${this.getStyles()}</style>
      </head>
      <body>
        <div class="container">
          <header>
            <h1>${I18n.t.popup.title}</h1>
            <div class="actions">
              <button id="refresh-button" class="btn-secondary">${I18n.t.popup.refresh}</button>
              <button id="settings-button" class="btn-secondary">${I18n.t.popup.settings}</button>
            </div>
          </header>

          <div id="error-banner" class="error-banner" hidden></div>
          <div id="no-data" class="no-data-state" hidden>
            <h2>${I18n.t.statusBar.noData}</h2>
            <p>${I18n.t.popup.noDataMessage}</p>
          </div>

          <div class="tabs">
            <button id="tab-today" class="tab ${todayActive}" data-tab="today">${I18n.t.popup.today}</button>
            <button id="tab-month" class="tab ${monthActive}" data-tab="month">${I18n.t.popup.thisMonth}</button>
            <button id="tab-all" class="tab ${allActive}" data-tab="all">${I18n.t.popup.allTime}</button>
          </div>

          <div class="provider-tabs">
            <button id="provider-claude" class="provider-tab ${this.providerTab === 'claude' ? 'active' : ''}" data-provider="claude">${I18n.t.provider.pill.claude}</button>
            <button id="provider-codex" class="provider-tab ${this.providerTab === 'codex' ? 'active' : ''}" data-provider="codex">${I18n.t.provider.pill.codex}</button>
          </div>

          ${this.buildTabContent('today', todayActive !== '')}
          ${this.buildTabContent('month', monthActive !== '')}
          ${this.buildTabContent('all', allActive !== '')}
        </div>

        <div id="loading-overlay" class="loading-overlay" hidden>
          <div class="loading-card">
            <div class="spinner"></div>
            <p>${I18n.t.statusBar.loading}</p>
          </div>
        </div>

        <script>
          window.__i18n = ${bootstrap};
          ${this.getScript()}
        </script>
      </body>
      </html>
    `;
  }

  private buildTabContent(period: PeriodTab, isActive: boolean): string {
    return `
      <section id="${period}" class="tab-content ${isActive ? 'active' : ''}" data-period="${period}">
        ${this.buildProviderPanel(period, 'claude')}
        ${this.buildProviderPanel(period, 'codex')}
      </section>
    `;
  }

  private buildProviderPanel(period: PeriodTab, provider: Provider): string {
    return `
      <div class="provider-panel ${provider === this.providerTab ? 'active' : ''}" data-period="${period}" data-provider="${provider}">
        <div class="panel-empty" data-slot="panel-empty" hidden>${I18n.t.popup.noDataMessage}</div>

        <div class="summary-slot" data-slot="summary"></div>

        <div class="period-breakdown" data-slot="breakdown">
          <h3 data-slot="section-title"></h3>
          <div class="chart-tabs" data-slot="metric-tabs"></div>
          <div class="chart-container">
            <div class="chart-content" data-slot="chart"></div>
          </div>
          <div class="daily-table-container">
            <table class="daily-table">
              <thead data-slot="table-head"></thead>
              <tbody data-slot="table-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private getStyles(): string {
    return `
      body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        margin: 0;
        padding: 16px;
      }

      .container {
        max-width: 960px;
        margin: 0 auto;
      }

      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--vscode-panel-border);
        padding-bottom: 16px;
        gap: 12px;
      }

      h1 {
        margin: 0;
        font-size: 20px;
      }

      .actions {
        display: flex;
        gap: 8px;
      }

      button {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 12px;
      }

      button:hover {
        background: var(--vscode-button-hoverBackground);
      }

      .btn-secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }

      .btn-secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      .error-banner {
        margin-bottom: 12px;
        padding: 10px 12px;
        border: 1px solid var(--vscode-errorForeground);
        border-radius: 6px;
        color: var(--vscode-errorForeground);
        background: color-mix(in srgb, var(--vscode-errorForeground) 8%, transparent);
      }

      .no-data-state {
        text-align: center;
        padding: 16px;
        margin-bottom: 12px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
      }

      .tabs {
        display: flex;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      .tab {
        background: transparent;
        border: none;
        padding: 8px 16px;
        border-bottom: 2px solid transparent;
      }

      .tab.active {
        border-bottom-color: var(--vscode-focusBorder);
        color: var(--vscode-focusBorder);
      }

      .tab-content {
        display: none;
      }

      .tab-content.active {
        display: block;
      }

      .provider-tabs {
        display: inline-flex;
        margin-bottom: 16px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        overflow: hidden;
      }

      .provider-tab {
        background: transparent;
        border: none;
        border-right: 1px solid var(--vscode-panel-border);
        padding: 6px 14px;
      }

      .provider-tab:last-child {
        border-right: none;
      }

      .provider-tab.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      .provider-panel {
        display: none;
      }

      .provider-panel.active {
        display: block;
      }

      .panel-empty {
        text-align: center;
        padding: 24px 12px;
        color: var(--vscode-descriptionForeground);
        border: 1px dashed var(--vscode-panel-border);
        border-radius: 8px;
      }

      .usage-summary {
        margin-bottom: 24px;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
      }

      .summary-item {
        text-align: center;
        padding: 16px;
        background: var(--vscode-input-background);
        border-radius: 8px;
        border: 1px solid var(--vscode-input-border);
      }

      .summary-item .label {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 8px;
      }

      .summary-item .value {
        font-size: 18px;
        font-weight: bold;
      }

      .summary-item .value.cost {
        color: var(--vscode-charts-green);
      }

      .model-breakdown,
      .period-breakdown {
        margin-top: 24px;
      }

      .model-breakdown h3,
      .period-breakdown h3 {
        margin-bottom: 16px;
        font-size: 16px;
      }

      .model-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .model-item {
        padding: 12px;
        background: var(--vscode-input-background);
        border-radius: 6px;
        border: 1px solid var(--vscode-input-border);
      }

      .model-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        gap: 8px;
      }

      .model-name {
        font-weight: bold;
        color: var(--vscode-symbolIcon-functionForeground);
        overflow-wrap: anywhere;
      }

      .model-cost {
        font-weight: bold;
        color: var(--vscode-charts-green);
      }

      .model-details {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 8px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
      }

      .chart-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 16px;
        flex-wrap: wrap;
      }

      .chart-tab {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 11px;
      }

      .chart-tab.active {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-color: var(--vscode-focusBorder);
      }

      .chart-container {
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 20px;
        overflow-x: auto;
      }

      .chart-content {
        width: 100%;
        min-height: 170px;
      }

      .no-chart-data {
        min-height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--vscode-descriptionForeground);
      }

      .chart-svg {
        width: 100%;
        min-height: 160px;
      }

      .chart-bar-svg {
        transition: opacity 0.2s ease;
      }

      .chart-bar-svg.clickable {
        cursor: pointer;
      }

      .chart-bar-svg.clickable:hover {
        opacity: 0.85;
      }

      .chart-bar-svg.selected {
        stroke: var(--vscode-focusBorder);
        stroke-width: 2;
      }

      .chart-bar-svg.metric-cost {
        fill: var(--vscode-charts-green);
      }

      .chart-bar-svg.metric-inputTokens {
        fill: var(--vscode-charts-blue);
      }

      .chart-bar-svg.metric-outputTokens {
        fill: var(--vscode-charts-orange);
      }

      .chart-bar-svg.metric-cacheCreation {
        fill: var(--vscode-charts-purple);
      }

      .chart-bar-svg.metric-cacheRead {
        fill: var(--vscode-charts-yellow);
      }

      .chart-bar-svg.metric-messages {
        fill: var(--vscode-charts-foreground);
      }

      .chart-label-svg {
        fill: var(--vscode-descriptionForeground);
        font-size: 10px;
      }

      .daily-table-container {
        overflow-x: auto;
        margin-top: 12px;
      }

      .daily-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .daily-table th,
      .daily-table td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      .daily-table th {
        background: var(--vscode-input-background);
        font-weight: bold;
        color: var(--vscode-foreground);
        position: sticky;
        top: 0;
      }

      .daily-table tbody tr:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .date-cell {
        font-weight: bold;
        color: var(--vscode-symbolIcon-functionForeground);
        white-space: nowrap;
      }

      .cost-cell {
        font-weight: bold;
        color: var(--vscode-charts-green);
        text-align: right;
      }

      .number-cell {
        text-align: right;
        font-family: var(--vscode-editor-font-family);
      }

      .detail-cell {
        text-align: center;
        width: 40px;
      }

      .detail-button {
        background: transparent;
        border: none;
        color: var(--vscode-foreground);
        cursor: pointer;
        padding: 2px 6px;
      }

      .detail-button.expanded {
        transform: rotate(180deg);
      }

      .detail-row > td {
        padding: 0;
      }

      .drilldown-body {
        padding: 14px;
        background: var(--vscode-input-background);
      }

      .drilldown-body h4 {
        margin: 0 0 10px 0;
      }

      .loading-overlay {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, var(--vscode-editor-background) 75%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }

      .loading-overlay[hidden] {
        display: none;
      }

      .loading-card {
        min-width: 180px;
        text-align: center;
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 8px;
        padding: 16px;
      }

      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--vscode-progressBar-background);
        border-top: 3px solid var(--vscode-focusBorder);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 12px;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      @media (max-width: 768px) {
        body {
          padding: 12px;
        }

        header {
          flex-direction: column;
          align-items: flex-start;
        }

        .actions {
          width: 100%;
          justify-content: flex-start;
        }

        .summary-grid {
          grid-template-columns: 1fr 1fr;
        }
      }
    `;
  }

  private getScript(): string {
    return `
(function () {
  var vscode = acquireVsCodeApi();
  var bootstrap = window.__i18n || {};
  var i18n = bootstrap.t || {};
  var popup = i18n.popup || {};
  var statusBar = i18n.statusBar || {};
  var decimalPlaces = Number.isFinite(bootstrap.decimalPlaces) ? bootstrap.decimalPlaces : 2;

  var state = {
    payload: null,
    activeTab: getInitialTab(),
    activeProvider: getInitialProvider(),
    panelMetrics: new Map(),
    drilldownMetrics: new Map(),
    drilldownData: new Map(),
    pendingDrilldown: new Map(),
  };

  function getInitialTab() {
    var active = document.querySelector('.tab.active');
    var tab = active ? active.getAttribute('data-tab') : null;
    return tab || 'today';
  }

  function getInitialProvider() {
    var active = document.querySelector('.provider-tab.active');
    var provider = active ? active.getAttribute('data-provider') : null;
    return provider || 'claude';
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function clearChildren(element) {
    if (!element) {
      return;
    }
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function text(path, fallback) {
    var parts = path.split('.');
    var value = i18n;
    for (var i = 0; i < parts.length; i += 1) {
      if (!value || typeof value !== 'object') {
        return fallback;
      }
      value = value[parts[i]];
    }
    return typeof value === 'string' ? value : fallback;
  }

  function formatNumber(value) {
    var num = Number(value || 0);
    return num.toLocaleString();
  }

  function formatCurrency(value) {
    var num = Number(value || 0);
    return '$' + num.toFixed(decimalPlaces);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function metricLabel(metric) {
    switch (metric) {
      case 'cost':
        return popup.cost || 'Cost';
      case 'inputTokens':
        return popup.inputTokens || 'Input Tokens';
      case 'outputTokens':
        return popup.outputTokens || 'Output Tokens';
      case 'cacheCreation':
        return popup.cacheCreation || 'Cache Creation';
      case 'cacheRead':
        return popup.cacheRead || 'Cache Read';
      case 'messages':
        return popup.messages || 'Messages';
      default:
        return metric;
    }
  }

  function metricValue(usageData, metric) {
    if (!usageData) {
      return 0;
    }

    switch (metric) {
      case 'cost':
        return usageData.totalCost || 0;
      case 'inputTokens':
        return usageData.totalInputTokens || 0;
      case 'outputTokens':
        return usageData.totalOutputTokens || 0;
      case 'cacheCreation':
        return usageData.totalCacheCreationTokens || 0;
      case 'cacheRead':
        return usageData.totalCacheReadTokens || 0;
      case 'messages':
        return usageData.messageCount || 0;
      default:
        return 0;
    }
  }

  function periodData(dataset, period) {
    if (!dataset) {
      return {
        summary: null,
        points: [],
      };
    }

    if (period === 'today') {
      return {
        summary: dataset.todayData || null,
        points: dataset.hourlyDataForToday || [],
      };
    }

    if (period === 'month') {
      return {
        summary: dataset.monthData || null,
        points: dataset.dailyDataForMonth || [],
      };
    }

    return {
      summary: dataset.allTimeData || null,
      points: dataset.dailyDataForAllTime || [],
    };
  }

  function chartLabelForPoint(period, point) {
    if (period === 'today') {
      return point.hour || '';
    }

    var date = new Date(point.date || '');
    if (isNaN(date.getTime())) {
      return String(point.date || '');
    }

    if (period === 'all') {
      return String(date.getFullYear()) + '/' + String(date.getMonth() + 1).padStart(2, '0');
    }

    return String(date.getMonth() + 1) + '/' + String(date.getDate());
  }

  function tableLabelForPoint(period, point) {
    if (period === 'today') {
      return point.hour || '';
    }

    var date = new Date(point.date || '');
    if (isNaN(date.getTime())) {
      return String(point.date || '');
    }

    if (period === 'all') {
      return String(date.getFullYear()) + '/' + String(date.getMonth() + 1).padStart(2, '0');
    }

    return date.toLocaleDateString();
  }

  function sortForChart(period, points) {
    var sorted = points.slice();

    if (period === 'today') {
      sorted.sort(function (a, b) {
        return String(a.hour || '').localeCompare(String(b.hour || ''));
      });
      return sorted;
    }

    sorted.sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''));
    });
    return sorted;
  }

  function panelKey(period, provider) {
    return period + ':' + provider;
  }

  function queryPanel(period, provider) {
    return document.querySelector('.provider-panel[data-period="' + period + '"][data-provider="' + provider + '"]');
  }

  function applyLoading(loading) {
    var overlay = byId('loading-overlay');
    if (!overlay) {
      return;
    }

    if (loading) {
      overlay.removeAttribute('hidden');
      return;
    }

    overlay.setAttribute('hidden', 'hidden');
  }

  function applyUpdate(payload) {
    state.payload = payload;

    var errorBanner = byId('error-banner');
    if (errorBanner) {
      if (payload.error) {
        errorBanner.textContent = String(payload.error);
        errorBanner.removeAttribute('hidden');
      } else {
        errorBanner.textContent = '';
        errorBanner.setAttribute('hidden', 'hidden');
      }
    }

    var noData = byId('no-data');
    if (noData) {
      if (payload.hasAnyData) {
        noData.setAttribute('hidden', 'hidden');
      } else {
        noData.removeAttribute('hidden');
      }
    }

    var codexTab = document.querySelector('.provider-tab[data-provider="codex"]');
    if (codexTab) {
      if (payload.codexEnabled) {
        codexTab.removeAttribute('hidden');
      } else {
        codexTab.setAttribute('hidden', 'hidden');
      }
    }

    var codexPanels = document.querySelectorAll('.provider-panel[data-provider="codex"]');
    codexPanels.forEach(function (panel) {
      if (payload.codexEnabled) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', 'hidden');
      }
    });

    if (!payload.codexEnabled && state.activeProvider === 'codex') {
      setActiveProvider('claude', true);
    }

    renderAllPanels(payload);
  }

  function renderAllPanels(payload) {
    renderPanel('today', 'claude', payload.claude);
    renderPanel('month', 'claude', payload.claude);
    renderPanel('all', 'claude', payload.claude);

    renderPanel('today', 'codex', payload.codex);
    renderPanel('month', 'codex', payload.codex);
    renderPanel('all', 'codex', payload.codex);
  }

  function renderPanel(period, provider, dataset) {
    var panel = queryPanel(period, provider);
    if (!panel) {
      return;
    }

    var summarySlot = panel.querySelector('[data-slot="summary"]');
    var emptySlot = panel.querySelector('[data-slot="panel-empty"]');
    var breakdown = panel.querySelector('[data-slot="breakdown"]');
    var sectionTitle = panel.querySelector('[data-slot="section-title"]');
    var metricTabs = panel.querySelector('[data-slot="metric-tabs"]');
    var chartSlot = panel.querySelector('[data-slot="chart"]');
    var tableHead = panel.querySelector('[data-slot="table-head"]');
    var tableBody = panel.querySelector('[data-slot="table-body"]');

    clearChildren(summarySlot);
    clearChildren(metricTabs);
    clearChildren(tableHead);
    clearChildren(tableBody);

    var periodInfo = periodData(dataset, period);
    var summary = periodInfo.summary;
    var points = Array.isArray(periodInfo.points) ? periodInfo.points : [];

    var hasSummaryData = !!summary && Number(summary.messageCount || 0) > 0;

    if (!hasSummaryData) {
      if (emptySlot) {
        emptySlot.removeAttribute('hidden');
      }
      if (breakdown) {
        breakdown.setAttribute('hidden', 'hidden');
      }
      return;
    }

    if (emptySlot) {
      emptySlot.setAttribute('hidden', 'hidden');
    }
    if (breakdown) {
      breakdown.removeAttribute('hidden');
    }

    renderSummary(summarySlot, summary);

    if (sectionTitle) {
      if (period === 'today') {
        sectionTitle.textContent = popup.hourlyBreakdown || 'Hourly Usage';
      } else if (period === 'month') {
        sectionTitle.textContent = popup.dailyBreakdown || 'Daily Usage';
      } else {
        sectionTitle.textContent = popup.monthlyBreakdown || 'Monthly Usage';
      }
    }

    var key = panelKey(period, provider);
    var metric = state.panelMetrics.get(key) || 'cost';
    state.panelMetrics.set(key, metric);

    renderMetricTabs(metricTabs, metric, {
      scope: 'panel',
      key: key,
    });

    renderPanelChart(period, panel, points, metric);
    renderPanelTable(period, panel, points);
  }

  function renderSummary(summarySlot, usageData) {
    if (!summarySlot || !usageData) {
      return;
    }

    var root = document.createElement('div');
    root.className = 'usage-summary';

    var grid = document.createElement('div');
    grid.className = 'summary-grid';

    appendSummaryItem(grid, metricLabel('cost'), formatCurrency(usageData.totalCost || 0), true);
    appendSummaryItem(grid, metricLabel('messages'), formatNumber(usageData.messageCount || 0), false);
    appendSummaryItem(grid, metricLabel('inputTokens'), formatNumber(usageData.totalInputTokens || 0), false);
    appendSummaryItem(grid, metricLabel('outputTokens'), formatNumber(usageData.totalOutputTokens || 0), false);
    appendSummaryItem(grid, metricLabel('cacheCreation'), formatNumber(usageData.totalCacheCreationTokens || 0), false);
    appendSummaryItem(grid, metricLabel('cacheRead'), formatNumber(usageData.totalCacheReadTokens || 0), false);

    root.appendChild(grid);

    var entries = Object.entries(usageData.modelBreakdown || {});
    if (entries.length > 0) {
      var modelBreakdown = document.createElement('div');
      modelBreakdown.className = 'model-breakdown';

      var title = document.createElement('h3');
      title.textContent = popup.modelBreakdown || 'Model Usage';
      modelBreakdown.appendChild(title);

      var modelList = document.createElement('div');
      modelList.className = 'model-list';

      entries.forEach(function (entry) {
        var modelName = entry[0];
        var modelData = entry[1];

        var item = document.createElement('div');
        item.className = 'model-item';

        var header = document.createElement('div');
        header.className = 'model-header';

        var nameNode = document.createElement('span');
        nameNode.className = 'model-name';
        nameNode.textContent = modelName;

        var costNode = document.createElement('span');
        costNode.className = 'model-cost';
        costNode.textContent = formatCurrency(modelData.cost || 0);

        header.appendChild(nameNode);
        header.appendChild(costNode);

        var details = document.createElement('div');
        details.className = 'model-details';

        appendDetail(details, metricLabel('inputTokens'), formatNumber(modelData.inputTokens || 0));
        appendDetail(details, metricLabel('outputTokens'), formatNumber(modelData.outputTokens || 0));
        appendDetail(details, metricLabel('cacheCreation'), formatNumber(modelData.cacheCreationTokens || 0));
        appendDetail(details, metricLabel('cacheRead'), formatNumber(modelData.cacheReadTokens || 0));
        appendDetail(details, metricLabel('messages'), formatNumber(modelData.count || 0));

        item.appendChild(header);
        item.appendChild(details);
        modelList.appendChild(item);
      });

      modelBreakdown.appendChild(modelList);
      root.appendChild(modelBreakdown);
    }

    summarySlot.appendChild(root);
  }

  function appendSummaryItem(grid, labelText, valueText, isCost) {
    var item = document.createElement('div');
    item.className = 'summary-item';

    var label = document.createElement('div');
    label.className = 'label';
    label.textContent = labelText;

    var value = document.createElement('div');
    value.className = isCost ? 'value cost' : 'value';
    value.textContent = valueText;

    item.appendChild(label);
    item.appendChild(value);
    grid.appendChild(item);
  }

  function appendDetail(parent, label, value) {
    var node = document.createElement('span');
    node.textContent = label + ': ' + value;
    parent.appendChild(node);
  }

  function renderMetricTabs(container, activeMetric, meta) {
    if (!container) {
      return;
    }

    var metrics = ['cost', 'inputTokens', 'outputTokens', 'cacheCreation', 'cacheRead', 'messages'];

    metrics.forEach(function (metric) {
      var button = document.createElement('button');
      button.className = metric === activeMetric ? 'chart-tab active' : 'chart-tab';
      button.setAttribute('data-role', 'metric-tab');
      button.setAttribute('data-metric', metric);
      button.setAttribute('data-scope', meta.scope);
      button.setAttribute('data-key', meta.key);
      button.textContent = metricLabel(metric);
      container.appendChild(button);
    });
  }

  function panelChartPoints(period, points) {
    var sorted = sortForChart(period, points);
    return sorted.map(function (point) {
      var key = period === 'today' ? String(point.hour || '') : String(point.date || '');
      return {
        key: key,
        label: chartLabelForPoint(period, point),
        usageData: point.data || {},
      };
    });
  }

  function renderPanelChart(period, panel, points, metric) {
    var chartSlot = panel.querySelector('[data-slot="chart"]');
    if (!chartSlot) {
      return;
    }

    var items = panelChartPoints(period, points);
    var clickableKind = period === 'month' ? 'hourly' : period === 'all' ? 'daily' : null;

    // SAFETY: chart SVG is generated locally; inserted values are numeric or escaped labels.
    chartSlot.innerHTML = buildChartSvg(items, metric, clickableKind);
  }

  function buildChartSvg(items, metric, clickableKind) {
    if (!items || items.length === 0) {
      return '<div class="no-chart-data">' + escapeHtml(popup.noDataMessage || 'No data available') + '</div>';
    }

    var width = Math.max(360, items.length * 42);
    var height = 160;
    var chartTop = 10;
    var chartBottom = 122;
    var chartHeight = chartBottom - chartTop;
    var left = 18;
    var innerWidth = width - left * 2;
    var barWidth = Math.max(8, Math.floor(innerWidth / (items.length * 1.5)));
    var step = innerWidth / items.length;

    var maxValue = 0;
    items.forEach(function (item) {
      var value = metricValue(item.usageData, metric);
      if (value > maxValue) {
        maxValue = value;
      }
    });

    var content = '';

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var value = metricValue(item.usageData, metric);
      var normalized = maxValue > 0 ? value / maxValue : 0;
      var barHeight = Math.max(2, normalized * chartHeight);
      var x = left + i * step + (step - barWidth) / 2;
      var y = chartBottom - barHeight;
      var title = item.label + ': ' + (metric === 'cost' ? formatCurrency(value) : formatNumber(value));
      var extra = '';

      if (clickableKind && item.key) {
        extra = ' data-click-kind="' + escapeHtml(clickableKind) + '" data-detail-key="' + escapeHtml(item.key) + '"';
      }

      content += '<g>';
      content += '<rect class="chart-bar-svg metric-' + escapeHtml(metric) + (clickableKind ? ' clickable' : '') + '"';
      content += ' x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '"';
      content += ' width="' + barWidth + '" height="' + barHeight.toFixed(2) + '"';
      content += extra + '>';
      content += '<title>' + escapeHtml(title) + '</title>';
      content += '</rect>';
      content += '<text class="chart-label-svg" x="' + (x + barWidth / 2).toFixed(2) + '" y="142" text-anchor="middle">';
      content += escapeHtml(item.label);
      content += '</text>';
      content += '</g>';
    }

    return '<svg class="chart-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">' + content + '</svg>';
  }

  function renderPanelTable(period, panel, points) {
    var tableHead = panel.querySelector('[data-slot="table-head"]');
    var tableBody = panel.querySelector('[data-slot="table-body"]');
    if (!tableHead || !tableBody) {
      return;
    }

    clearChildren(tableHead);
    clearChildren(tableBody);

    var headerRow = document.createElement('tr');
    var headers = [
      period === 'today' ? (popup.hourlyBreakdown || 'Hour') : (popup.date || 'Date'),
      metricLabel('cost'),
      metricLabel('inputTokens'),
      metricLabel('outputTokens'),
      metricLabel('cacheCreation'),
      metricLabel('cacheRead'),
      metricLabel('messages'),
    ];

    if (period !== 'today') {
      headers.push('');
    }

    headers.forEach(function (header) {
      var th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });

    tableHead.appendChild(headerRow);

    points.forEach(function (point) {
      var usageData = point.data || {};
      var row = document.createElement('tr');

      appendCell(row, tableLabelForPoint(period, point), 'date-cell');
      appendCell(row, formatCurrency(usageData.totalCost || 0), 'cost-cell');
      appendCell(row, formatNumber(usageData.totalInputTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.totalOutputTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.totalCacheCreationTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.totalCacheReadTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.messageCount || 0), 'number-cell');

      if (period !== 'today') {
        var detailCell = document.createElement('td');
        detailCell.className = 'detail-cell';

        var detailButton = document.createElement('button');
        detailButton.className = 'detail-button';
        detailButton.setAttribute('data-role', 'detail-button');
        detailButton.setAttribute('data-kind', period === 'month' ? 'hourly' : 'daily');
        detailButton.setAttribute('data-key', point.date || '');
        detailButton.textContent = 'v';

        detailCell.appendChild(detailButton);
        row.appendChild(detailCell);
      }

      tableBody.appendChild(row);

      if (period !== 'today') {
        var detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.setAttribute('hidden', 'hidden');
        detailRow.setAttribute('data-detail-kind', period === 'month' ? 'hourly' : 'daily');
        detailRow.setAttribute('data-detail-key', point.date || '');

        var detailTd = document.createElement('td');
        detailTd.colSpan = 8;

        var detailContainer = document.createElement('div');
        detailContainer.className = 'drilldown-body';
        detailContainer.setAttribute('data-drilldown-kind', period === 'month' ? 'hourly' : 'daily');
        detailContainer.setAttribute('data-detail-key', point.date || '');

        detailTd.appendChild(detailContainer);
        detailRow.appendChild(detailTd);
        tableBody.appendChild(detailRow);
      }
    });
  }

  function appendCell(row, value, className) {
    var td = document.createElement('td');
    td.className = className;
    td.textContent = value;
    row.appendChild(td);
  }

  function setActiveTab(tab, notifyHost) {
    state.activeTab = tab;

    document.querySelectorAll('.tab').forEach(function (button) {
      var isActive = button.getAttribute('data-tab') === tab;
      button.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.tab-content').forEach(function (content) {
      var isActive = content.getAttribute('data-period') === tab;
      content.classList.toggle('active', isActive);
    });

    if (notifyHost) {
      vscode.postMessage({ command: 'tabChanged', tab: tab });
    }
  }

  function setActiveProvider(provider, notifyHost) {
    state.activeProvider = provider;

    document.querySelectorAll('.provider-tab').forEach(function (button) {
      var isActive = button.getAttribute('data-provider') === provider;
      button.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.tab-content').forEach(function (content) {
      content.querySelectorAll('.provider-panel').forEach(function (panel) {
        var panelProvider = panel.getAttribute('data-provider');
        panel.classList.toggle('active', panelProvider === provider);
      });
    });

    if (notifyHost) {
      vscode.postMessage({ command: 'providerChanged', provider: provider });
    }
  }

  function closeDetails(panel) {
    panel.querySelectorAll('.detail-row').forEach(function (row) {
      row.setAttribute('hidden', 'hidden');
    });

    panel.querySelectorAll('.detail-button').forEach(function (button) {
      button.classList.remove('expanded');
    });

    panel.querySelectorAll('.chart-bar-svg.selected').forEach(function (bar) {
      bar.classList.remove('selected');
    });
  }

  function openDetail(panel, kind, key) {
    if (!key) {
      return;
    }

    var row = panel.querySelector('.detail-row[data-detail-kind="' + kind + '"][data-detail-key="' + key + '"]');
    var button = panel.querySelector('.detail-button[data-kind="' + kind + '"][data-key="' + key + '"]');

    if (!row || !button) {
      return;
    }

    var isHidden = row.hasAttribute('hidden');

    closeDetails(panel);

    if (!isHidden) {
      return;
    }

    row.removeAttribute('hidden');
    button.classList.add('expanded');

    var selectedBar = panel.querySelector('.chart-bar-svg[data-detail-key="' + key + '"]');
    if (selectedBar) {
      selectedBar.classList.add('selected');
    }

    var container = row.querySelector('.drilldown-body');
    if (!container) {
      return;
    }

    var responseKey = kind + ':' + key;
    state.pendingDrilldown.set(responseKey, container);

    if (container.getAttribute('data-loaded') === 'true') {
      return;
    }

    container.setAttribute('data-loaded', 'true');
    container.textContent = statusBar.loading || 'Loading...';

    if (kind === 'hourly') {
      vscode.postMessage({ command: 'getHourlyData', date: key });
    } else {
      vscode.postMessage({ command: 'getDailyData', month: key });
    }
  }

  function renderDrilldown(kind, key, data) {
    var responseKey = kind + ':' + key;
    var container = state.pendingDrilldown.get(responseKey);

    if (!container) {
      container = document.querySelector('.drilldown-body[data-drilldown-kind="' + kind + '"][data-detail-key="' + key + '"]');
    }

    if (!container) {
      return;
    }

    state.pendingDrilldown.delete(responseKey);
    state.drilldownData.set(responseKey, Array.isArray(data) ? data : []);

    clearChildren(container);

    var rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'no-chart-data';
      empty.textContent = popup.noDataMessage || 'No data available';
      container.appendChild(empty);
      return;
    }

    var wrapper = document.createElement('div');
    wrapper.className = 'period-breakdown';

    var title = document.createElement('h4');
    if (kind === 'hourly') {
      title.textContent = (popup.hourlyBreakdown || 'Hourly Usage') + ' - ' + tableLabelForDrilldownKey(key);
    } else {
      title.textContent = (popup.dailyBreakdown || 'Daily Usage') + ' - ' + tableLabelForDrilldownKey(key, true);
    }
    wrapper.appendChild(title);

    var metricTabs = document.createElement('div');
    metricTabs.className = 'chart-tabs';
    var metric = state.drilldownMetrics.get(responseKey) || 'cost';
    state.drilldownMetrics.set(responseKey, metric);

    renderMetricTabs(metricTabs, metric, {
      scope: 'drilldown',
      key: responseKey,
    });
    wrapper.appendChild(metricTabs);

    var chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    var chartContent = document.createElement('div');
    chartContent.className = 'chart-content';
    chartContent.setAttribute('data-drilldown-chart', responseKey);
    chartContainer.appendChild(chartContent);
    wrapper.appendChild(chartContainer);

    var tableContainer = document.createElement('div');
    tableContainer.className = 'daily-table-container';
    var table = document.createElement('table');
    table.className = 'daily-table';

    var head = document.createElement('thead');
    var headRow = document.createElement('tr');
    [
      kind === 'hourly' ? (popup.hourlyBreakdown || 'Hour') : (popup.date || 'Date'),
      metricLabel('cost'),
      metricLabel('inputTokens'),
      metricLabel('outputTokens'),
      metricLabel('cacheCreation'),
      metricLabel('cacheRead'),
      metricLabel('messages'),
    ].forEach(function (header) {
      var th = document.createElement('th');
      th.textContent = header;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    var body = document.createElement('tbody');
    rows.forEach(function (item) {
      var usageData = item.data || {};
      var row = document.createElement('tr');
      appendCell(row, kind === 'hourly' ? String(item.hour || '') : tableLabelForPoint('month', item), 'date-cell');
      appendCell(row, formatCurrency(usageData.totalCost || 0), 'cost-cell');
      appendCell(row, formatNumber(usageData.totalInputTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.totalOutputTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.totalCacheCreationTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.totalCacheReadTokens || 0), 'number-cell');
      appendCell(row, formatNumber(usageData.messageCount || 0), 'number-cell');
      body.appendChild(row);
    });

    table.appendChild(body);
    tableContainer.appendChild(table);
    wrapper.appendChild(tableContainer);
    container.appendChild(wrapper);

    renderDrilldownChart(responseKey, metric);
  }

  function tableLabelForDrilldownKey(key, monthLabel) {
    var date = new Date(key);
    if (isNaN(date.getTime())) {
      return String(key);
    }

    if (monthLabel) {
      return String(date.getFullYear()) + '/' + String(date.getMonth() + 1).padStart(2, '0');
    }

    return date.toLocaleDateString();
  }

  function renderDrilldownChart(drilldownKey, metric) {
    var chartSlot = document.querySelector('[data-drilldown-chart="' + drilldownKey + '"]');
    if (!chartSlot) {
      return;
    }

    var data = state.drilldownData.get(drilldownKey) || [];
    var kind = drilldownKey.startsWith('hourly:') ? 'hourly' : 'daily';

    var points = data.map(function (item) {
      return {
        key: kind === 'hourly' ? String(item.hour || '') : String(item.date || ''),
        label: kind === 'hourly' ? String(item.hour || '') : chartLabelForPoint('month', item),
        usageData: item.data || {},
      };
    });

    // SAFETY: chart SVG is generated locally; inserted values are numeric or escaped labels.
    chartSlot.innerHTML = buildChartSvg(points, metric, null);
  }

  function updatePanelMetric(key, metric) {
    state.panelMetrics.set(key, metric);

    var parts = key.split(':');
    if (parts.length !== 2 || !state.payload) {
      return;
    }

    var period = parts[0];
    var provider = parts[1];
    var dataset = provider === 'codex' ? state.payload.codex : state.payload.claude;
    var panel = queryPanel(period, provider);
    if (!panel) {
      return;
    }

    var points = periodData(dataset, period).points || [];
    renderPanelChart(period, panel, points, metric);
  }

  function updateMetricButtons(scope, key, metric) {
    document.querySelectorAll('.chart-tab[data-scope="' + scope + '"][data-key="' + key + '"]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-metric') === metric);
    });
  }

  function handleClick(event) {
    var target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    var refreshButton = target.closest('#refresh-button');
    if (refreshButton) {
      vscode.postMessage({ command: 'refresh' });
      return;
    }

    var settingsButton = target.closest('#settings-button');
    if (settingsButton) {
      vscode.postMessage({ command: 'openSettings' });
      return;
    }

    var tabButton = target.closest('.tab');
    if (tabButton) {
      var tab = tabButton.getAttribute('data-tab');
      if (tab) {
        setActiveTab(tab, true);
      }
      return;
    }

    var providerButton = target.closest('.provider-tab');
    if (providerButton) {
      var provider = providerButton.getAttribute('data-provider');
      if (provider) {
        setActiveProvider(provider, true);
      }
      return;
    }

    var metricButton = target.closest('.chart-tab[data-role="metric-tab"]');
    if (metricButton) {
      var scope = metricButton.getAttribute('data-scope');
      var key = metricButton.getAttribute('data-key');
      var metric = metricButton.getAttribute('data-metric');

      if (!scope || !key || !metric) {
        return;
      }

      updateMetricButtons(scope, key, metric);

      if (scope === 'panel') {
        updatePanelMetric(key, metric);
      } else {
        state.drilldownMetrics.set(key, metric);
        renderDrilldownChart(key, metric);
      }
      return;
    }

    var detailButton = target.closest('.detail-button[data-role="detail-button"]');
    if (detailButton) {
      var panel = detailButton.closest('.provider-panel');
      if (!panel) {
        return;
      }

      var kind = detailButton.getAttribute('data-kind');
      var keyValue = detailButton.getAttribute('data-key');
      if (kind && keyValue) {
        openDetail(panel, kind, keyValue);
      }
      return;
    }

    var clickableBar = target.closest('.chart-bar-svg.clickable');
    if (clickableBar) {
      var barPanel = clickableBar.closest('.provider-panel');
      if (!barPanel) {
        return;
      }

      var barKind = clickableBar.getAttribute('data-click-kind');
      var barKey = clickableBar.getAttribute('data-detail-key');
      if (barKind && barKey) {
        openDetail(barPanel, barKind, barKey);
      }
    }
  }

  function handleMessage(event) {
    var message = event.data || {};

    switch (message.command) {
      case 'setLoading':
        applyLoading(Boolean(message.loading));
        break;
      case 'updateData':
        applyUpdate(message.payload || {});
        break;
      case 'hourlyDataResponse':
        renderDrilldown('hourly', String(message.date || ''), message.data || []);
        break;
      case 'dailyDataResponse':
        renderDrilldown('daily', String(message.month || ''), message.data || []);
        break;
      default:
        break;
    }
  }

  document.addEventListener('click', handleClick);
  window.addEventListener('message', handleMessage);

  setActiveTab(state.activeTab, false);
  setActiveProvider(state.activeProvider, false);
  vscode.postMessage({ command: 'ready' });
})();
    `;
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}
