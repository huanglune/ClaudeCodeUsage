export interface ClaudeUsageRecord {
  timestamp: string;
  version?: string;
  message: {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      reasoning_output_tokens?: number;
    };
    model?: string;
    id?: string;
  };
  costUSD?: number;
  requestId?: string;
  isApiErrorMessage?: boolean;
  provider?: 'claude' | 'codex';
  providerId?: string;
  agent?: string;
}

export interface CodexUsageEventUsage {
  input_tokens?: number;
  prompt_tokens?: number;
  input?: number;
  output_tokens?: number;
  completion_tokens?: number;
  output?: number;
  cache_read_input_tokens?: number;
  cached_input_tokens?: number;
  cached_tokens?: number;
  cache_creation_input_tokens?: number;
  reasoning_output_tokens?: number;
}

export interface CodexUsageRecord {
  type?: string;
  timestamp?: string;
  model?: string;
  model_name?: string;
  usage?: CodexUsageEventUsage;
  data?: {
    model?: string;
    model_name?: string;
    usage?: CodexUsageEventUsage;
  };
  result?: {
    model?: string;
    model_name?: string;
    usage?: CodexUsageEventUsage;
  };
  response?: {
    model?: string;
    model_name?: string;
    usage?: CodexUsageEventUsage;
  };
  payload?: {
    type?: string;
    source?: string;
    model_provider?: string;
    agent_nickname?: string;
    model?: string;
    model_name?: string;
    model_info?: {
      slug?: string;
    };
    info?: {
      model?: string;
      model_name?: string;
      total_token_usage?: CodexUsageEventUsage;
      last_token_usage?: CodexUsageEventUsage;
      model_context_window?: number;
    } | null;
    total_token_usage?: CodexUsageEventUsage;
    last_token_usage?: CodexUsageEventUsage;
  };
}

export interface ModelBreakdownEntry {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  cost: number;
  count: number;
  provider: 'claude' | 'codex';
}

export interface HeatmapCell {
  date: string;
  cost: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface ProviderOverviewTotals {
  cost: number;
  messages: number;
  tokens: number;
}

export interface OverviewData {
  totalCost: number;
  totalTokens: number;
  totalMessages: number;
  sessionsCount: number;
  longestSessionMs: number;
  activeDays: {
    active: number;
    total: number;
  };
  mostActiveDay: {
    date: string;
    cost: number;
  } | null;
  longestStreak: number;
  currentStreak: number;
  favoriteModel: string | null;
  providerSplit: {
    claude: ProviderOverviewTotals;
    codex: ProviderOverviewTotals;
  };
  heatmap: HeatmapCell[];
  funFact: string | null;
}

export interface UsageData {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalReasoningTokens: number;
  totalCost: number;
  messageCount: number;
  modelBreakdown: Record<string, ModelBreakdownEntry>;
}

export interface SessionData extends UsageData {
  sessionStart: Date;
  sessionEnd: Date;
}

export interface DatasetPayload {
  sessionData: SessionData | null;
  todayData: UsageData | null;
  monthData: UsageData | null;
  allTimeData: UsageData | null;
  dailyDataForMonth: { date: string; data: UsageData }[];
  dailyDataForAllTime: { date: string; data: UsageData }[];
  hourlyDataForToday: { hour: string; data: UsageData }[];
}

export interface DashboardPayload {
  claude: DatasetPayload;
  codex: DatasetPayload;
  codexEnabled: boolean;
  dataDirectory: string | null;
  hasAnyData: boolean;
  error?: string | null;
}

export type HostToWebviewMessage =
  | { command: 'setLoading'; loading: boolean }
  | { command: 'updateData'; payload: DashboardPayload };

export interface ExtensionConfig {
  refreshInterval: number;
  dataDirectory: string;
  codexEnabled: boolean;
  codexIncludeArchived: boolean;
  codexDataDirectory: string;
  language: string;
  decimalPlaces: number;
  timezone: string;
}

export interface ModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  // 1M context-window tiered pricing (Claude 4+ 200k threshold)
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
  // Context limits (from LiteLLM)
  max_input_tokens?: number;
  max_output_tokens?: number;
}

export interface PricingSnapshot {
  _meta: {
    source: string;
    fetched_at: string; // ISO 8601
    source_commit: string; // short sha of LiteLLM main at fetch time
    model_count: number;
  };
  models: Record<string, ModelPricing>;
}

export type SupportedLanguage = 'en' | "de-DE" | 'zh-TW' | 'zh-CN' | 'ja' | 'ko';
