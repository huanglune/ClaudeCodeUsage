import { SupportedLanguage } from './types';

export interface Translations {
  statusBar: {
    loading: string;
    noData: string;
    notRunning: string;
    error: string;
    currentSession: string;
    claudeSection: string;
    codexSection: string;
  };
  popup: {
    title: string;
    currentSession: string;
    today: string;
    thisMonth: string;
    allTime: string;
    refresh: string;
    settings: string;
    totalTokens: string;
    inputTokens: string;
    outputTokens: string;
    cacheCreation: string;
    cacheRead: string;
    cost: string;
    messages: string;
    modelBreakdown: string;
    dailyBreakdown: string;
    monthlyBreakdown: string;
    hourlyBreakdown: string;
    date: string;
    yesterday: string;
    dataDirectory: string;
    noDataMessage: string;
    errorMessage: string;
    clickForDetails: string;
    trend: string;
  };
  settings: {
    title: string;
    refreshInterval: string;
    dataDirectory: string;
    language: string;
    decimalPlaces: string;
    codexEnabled: string;
    codexIncludeArchived: string;
    codexDataDirectory: string;
  };
  overview: {
    heatmap: {
      legend: string;
    };
    stats: {
      favoriteModel: string;
      totalTokens: string;
      sessions: string;
      longestSession: string;
      activeDays: string;
      mostActiveDay: string;
      longestStreak: string;
      currentStreak: string;
    };
    funFact: {
      template: string;
    };
  };
  provider: {
    pill: {
      overview: string;
      claude: string;
      codex: string;
    };
    badge: {
      claude: string;
      codex: string;
    };
  };
  reasoning: {
    label: string;
    tooltip: string;
  };
  listPriceFootnote: string;
  codex: {
    config: {
      enabled: string;
      includeArchived: string;
      dataDirectory: string;
    };
  };
}

const en: Translations = {
  statusBar: {
    loading: 'Loading...',
    noData: 'No Usage Data',
    notRunning: 'Claude Code / Codex not running',
    error: 'Error',
    currentSession: 'Session',
    claudeSection: 'Claude - Today',
    codexSection: 'Codex - Today',
  },
  popup: {
    title: 'Claude Code Usage',
    currentSession: 'Session',
    today: 'Today',
    thisMonth: 'This Month',
    allTime: 'All Time',
    refresh: 'Refresh',
    settings: 'Settings',
    totalTokens: 'Total Tokens',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    cacheCreation: 'Cache Creation',
    cacheRead: 'Cache Read',
    cost: 'Cost',
    messages: 'Messages',
    modelBreakdown: 'Model Usage',
    dailyBreakdown: 'Daily Usage',
    monthlyBreakdown: 'Monthly Usage',
    hourlyBreakdown: 'Hourly Usage',
    date: 'Date',
    yesterday: 'Yesterday',
    dataDirectory: 'Data Directory',
    noDataMessage: 'No usage data found yet.',
    errorMessage: 'Error loading usage data.',
    clickForDetails: 'Click for detailed breakdown',
    trend: 'Trend',
  },
  settings: {
    title: 'Claude Code Usage Settings',
    refreshInterval: 'Refresh Interval (seconds)',
    dataDirectory: 'Claude Data Directory',
    language: 'Language',
    decimalPlaces: 'Decimal Places',
    codexEnabled: 'Enable Codex data',
    codexIncludeArchived: 'Include archived Codex sessions',
    codexDataDirectory: 'Codex Data Directory',
  },
  overview: {
    heatmap: {
      legend: 'Activity Heatmap',
    },
    stats: {
      favoriteModel: 'Favorite Model',
      totalTokens: 'Total Tokens',
      sessions: 'Sessions',
      longestSession: 'Longest Session',
      activeDays: 'Active Days',
      mostActiveDay: 'Most Active Day',
      longestStreak: 'Longest Streak',
      currentStreak: 'Current Streak',
    },
    funFact: {
      template: '~{multiplier}x longer than {label}',
    },
  },
  provider: {
    pill: {
      overview: 'Overview',
      claude: 'Claude',
      codex: 'Codex',
    },
    badge: {
      claude: '[Claude]',
      codex: '[Codex]',
    },
  },
  reasoning: {
    label: 'Reasoning',
    tooltip: 'Reasoning output tokens',
  },
  listPriceFootnote: 'List-price equivalent based on official model pricing.',
  codex: {
    config: {
      enabled: 'Enable Codex integration',
      includeArchived: 'Include archived sessions',
      dataDirectory: 'Codex data directory',
    },
  },
};

const localeCatalog = {
  en,
  'de-DE': {
    statusBar: {
      loading: 'Lädt...',
      noData: 'Keine Nutzungsdaten',
      notRunning: 'Claude Code / Codex nicht aktiv',
      error: 'Fehler',
      currentSession: 'Sitzung',
      claudeSection: 'Claude - Heute',
      codexSection: 'Codex - Heute',
    },
    popup: {
      title: 'Claude Code Nutzung',
      currentSession: 'Sitzung',
      today: 'Heute',
      thisMonth: 'Dieser Monat',
      allTime: 'Gesamt',
      refresh: 'Aktualisieren',
      settings: 'Einstellungen',
      totalTokens: 'Token gesamt',
      inputTokens: 'Eingabe-Token',
      outputTokens: 'Ausgabe-Token',
      cacheCreation: 'Cache-Erstellung',
      cacheRead: 'Cache-Lesen',
      cost: 'Kosten',
      messages: 'Nachrichten',
      modelBreakdown: 'Modellnutzung',
      dailyBreakdown: 'Tagesnutzung',
      monthlyBreakdown: 'Monatsnutzung',
      hourlyBreakdown: 'Stündliche Nutzung',
      date: 'Datum',
      yesterday: 'Gestern',
      dataDirectory: 'Datenverzeichnis',
      noDataMessage: 'Noch keine Nutzungsdaten vorhanden.',
      errorMessage: 'Fehler beim Laden der Nutzungsdaten.',
      clickForDetails: 'Klicken für Details',
      trend: 'Trend',
    },
    settings: {
      title: 'Claude Code Nutzungseinstellungen',
      refreshInterval: 'Aktualisierungsintervall (Sekunden)',
      dataDirectory: 'Claude-Datenverzeichnis',
      language: 'Sprache',
      decimalPlaces: 'Dezimalstellen',
      codexEnabled: 'Codex-Daten aktivieren',
      codexIncludeArchived: 'Archivierte Codex-Sitzungen einbeziehen',
      codexDataDirectory: 'Codex-Datenverzeichnis',
    },
    overview: {
      heatmap: {
        legend: 'Aktivitäts-Heatmap',
      },
      stats: {
        favoriteModel: 'Lieblingsmodell',
        totalTokens: 'Token gesamt',
        sessions: 'Sitzungen',
        longestSession: 'Längste Sitzung',
        activeDays: 'Aktive Tage',
        mostActiveDay: 'Aktivster Tag',
        longestStreak: 'Längste Serie',
        currentStreak: 'Aktuelle Serie',
      },
      funFact: {
        template: '~{multiplier}x länger als {label}',
      },
    },
    provider: {
      pill: {
        overview: 'Überblick',
        claude: 'Claude',
        codex: 'Codex',
      },
      badge: {
        claude: '[Claude]',
        codex: '[Codex]',
      },
    },
    reasoning: {
      label: 'Reasoning',
      tooltip: 'Reasoning-Output-Token',
    },
    listPriceFootnote: 'List-Price-Äquivalent auf Basis offizieller Modellpreise.',
    codex: {
      config: {
        enabled: 'Codex-Integration aktivieren',
        includeArchived: 'Archivierte Sitzungen einschließen',
        dataDirectory: 'Codex-Datenverzeichnis',
      },
    },
  },
  'zh-TW': {
    statusBar: {
      loading: '載入中...',
      noData: '無使用資料',
      notRunning: 'Claude Code / Codex 未執行',
      error: '錯誤',
      currentSession: '會話',
      claudeSection: 'Claude - 今日',
      codexSection: 'Codex - 今日',
    },
    popup: {
      title: 'Claude Code 使用量',
      currentSession: '會話',
      today: '今日',
      thisMonth: '本月',
      allTime: '所有時間',
      refresh: '重新整理',
      settings: '設定',
      totalTokens: '總 Token',
      inputTokens: '輸入 Token',
      outputTokens: '輸出 Token',
      cacheCreation: '快取建立',
      cacheRead: '快取讀取',
      cost: '成本',
      messages: '訊息數',
      modelBreakdown: '模型使用量',
      dailyBreakdown: '每日使用量',
      monthlyBreakdown: '每月使用量',
      hourlyBreakdown: '每小時使用量',
      date: '日期',
      yesterday: '昨日',
      dataDirectory: '資料目錄',
      noDataMessage: '尚未找到使用資料。',
      errorMessage: '載入使用資料時發生錯誤。',
      clickForDetails: '點擊查看詳細資訊',
      trend: '趨勢',
    },
    settings: {
      title: 'Claude Code 使用量設定',
      refreshInterval: '重新整理間隔（秒）',
      dataDirectory: 'Claude 資料目錄',
      language: '語言',
      decimalPlaces: '小數位數',
      codexEnabled: '啟用 Codex 資料',
      codexIncludeArchived: '包含 Codex 封存會話',
      codexDataDirectory: 'Codex 資料目錄',
    },
    overview: {
      heatmap: {
        legend: '活動熱力圖',
      },
      stats: {
        favoriteModel: '最常用模型',
        totalTokens: '總 Token',
        sessions: '會話數',
        longestSession: '最長會話',
        activeDays: '活躍天數',
        mostActiveDay: '最活躍日',
        longestStreak: '最長連續天數',
        currentStreak: '目前連續天數',
      },
      funFact: {
        template: '約為 {label} 的 {multiplier} 倍',
      },
    },
    provider: {
      pill: {
        overview: '總覽',
        claude: 'Claude',
        codex: 'Codex',
      },
      badge: {
        claude: '[Claude]',
        codex: '[Codex]',
      },
    },
    reasoning: {
      label: '推理',
      tooltip: '推理輸出 Token',
    },
    listPriceFootnote: '依官方模型定價估算（list-price equivalent）。',
    codex: {
      config: {
        enabled: '啟用 Codex 整合',
        includeArchived: '包含封存會話',
        dataDirectory: 'Codex 資料目錄',
      },
    },
  },
  'zh-CN': {
    statusBar: {
      loading: '加载中...',
      noData: '无使用数据',
      notRunning: 'Claude Code / Codex 未运行',
      error: '错误',
      currentSession: '会话',
      claudeSection: 'Claude - 今日',
      codexSection: 'Codex - 今日',
    },
    popup: {
      title: 'Claude Code 使用量',
      currentSession: '会话',
      today: '今日',
      thisMonth: '本月',
      allTime: '所有时间',
      refresh: '刷新',
      settings: '设置',
      totalTokens: '总 Token',
      inputTokens: '输入 Token',
      outputTokens: '输出 Token',
      cacheCreation: '缓存创建',
      cacheRead: '缓存读取',
      cost: '成本',
      messages: '消息数',
      modelBreakdown: '模型使用量',
      dailyBreakdown: '每日使用量',
      monthlyBreakdown: '每月使用量',
      hourlyBreakdown: '每小时使用量',
      date: '日期',
      yesterday: '昨日',
      dataDirectory: '数据目录',
      noDataMessage: '尚未找到使用数据。',
      errorMessage: '加载使用数据时发生错误。',
      clickForDetails: '点击查看详细信息',
      trend: '趋势',
    },
    settings: {
      title: 'Claude Code 使用量设置',
      refreshInterval: '刷新间隔（秒）',
      dataDirectory: 'Claude 数据目录',
      language: '语言',
      decimalPlaces: '小数位数',
      codexEnabled: '启用 Codex 数据',
      codexIncludeArchived: '包含 Codex 归档会话',
      codexDataDirectory: 'Codex 数据目录',
    },
    overview: {
      heatmap: {
        legend: '活动热力图',
      },
      stats: {
        favoriteModel: '最常用模型',
        totalTokens: '总 Token',
        sessions: '会话数',
        longestSession: '最长会话',
        activeDays: '活跃天数',
        mostActiveDay: '最活跃日',
        longestStreak: '最长连续天数',
        currentStreak: '当前连续天数',
      },
      funFact: {
        template: '约为 {label} 的 {multiplier} 倍',
      },
    },
    provider: {
      pill: {
        overview: '总览',
        claude: 'Claude',
        codex: 'Codex',
      },
      badge: {
        claude: '[Claude]',
        codex: '[Codex]',
      },
    },
    reasoning: {
      label: '推理',
      tooltip: '推理输出 Token',
    },
    listPriceFootnote: '基于官方模型定价估算（list-price equivalent）。',
    codex: {
      config: {
        enabled: '启用 Codex 集成',
        includeArchived: '包含归档会话',
        dataDirectory: 'Codex 数据目录',
      },
    },
  },
  ja: {
    statusBar: {
      loading: '読み込み中...',
      noData: '使用データなし',
      notRunning: 'Claude Code / Codex が実行されていません',
      error: 'エラー',
      currentSession: 'セッション',
      claudeSection: 'Claude - 今日',
      codexSection: 'Codex - 今日',
    },
    popup: {
      title: 'Claude Code 使用量',
      currentSession: 'セッション',
      today: '今日',
      thisMonth: '今月',
      allTime: '全期間',
      refresh: '更新',
      settings: '設定',
      totalTokens: '合計トークン',
      inputTokens: '入力トークン',
      outputTokens: '出力トークン',
      cacheCreation: 'キャッシュ作成',
      cacheRead: 'キャッシュ読み取り',
      cost: 'コスト',
      messages: 'メッセージ数',
      modelBreakdown: 'モデル別使用量',
      dailyBreakdown: '日別使用量',
      monthlyBreakdown: '月別使用量',
      hourlyBreakdown: '時間別使用量',
      date: '日付',
      yesterday: '昨日',
      dataDirectory: 'データディレクトリ',
      noDataMessage: '使用データが見つかりません。',
      errorMessage: '使用データの読み込み中にエラーが発生しました。',
      clickForDetails: 'クリックして詳細を表示',
      trend: '推移',
    },
    settings: {
      title: 'Claude Code 使用量設定',
      refreshInterval: '更新間隔（秒）',
      dataDirectory: 'Claude データディレクトリ',
      language: '言語',
      decimalPlaces: '小数点桁数',
      codexEnabled: 'Codex データを有効化',
      codexIncludeArchived: 'Codex のアーカイブセッションを含める',
      codexDataDirectory: 'Codex データディレクトリ',
    },
    overview: {
      heatmap: {
        legend: 'アクティビティヒートマップ',
      },
      stats: {
        favoriteModel: 'お気に入りモデル',
        totalTokens: '合計トークン',
        sessions: 'セッション数',
        longestSession: '最長セッション',
        activeDays: 'アクティブ日数',
        mostActiveDay: '最もアクティブな日',
        longestStreak: '最長連続日数',
        currentStreak: '現在の連続日数',
      },
      funFact: {
        template: '{label} の約 {multiplier} 倍',
      },
    },
    provider: {
      pill: {
        overview: '概要',
        claude: 'Claude',
        codex: 'Codex',
      },
      badge: {
        claude: '[Claude]',
        codex: '[Codex]',
      },
    },
    reasoning: {
      label: '推論',
      tooltip: '推論出力トークン',
    },
    listPriceFootnote: '公式モデル価格に基づく概算（list-price equivalent）です。',
    codex: {
      config: {
        enabled: 'Codex 連携を有効化',
        includeArchived: 'アーカイブセッションを含める',
        dataDirectory: 'Codex データディレクトリ',
      },
    },
  },
  ko: {
    statusBar: {
      loading: '로딩 중...',
      noData: '사용 데이터 없음',
      notRunning: 'Claude Code / Codex가 실행 중이 아님',
      error: '오류',
      currentSession: '세션',
      claudeSection: 'Claude - 오늘',
      codexSection: 'Codex - 오늘',
    },
    popup: {
      title: 'Claude Code 사용량',
      currentSession: '세션',
      today: '오늘',
      thisMonth: '이번 달',
      allTime: '전체 기간',
      refresh: '새로고침',
      settings: '설정',
      totalTokens: '총 토큰',
      inputTokens: '입력 토큰',
      outputTokens: '출력 토큰',
      cacheCreation: '캐시 생성',
      cacheRead: '캐시 읽기',
      cost: '비용',
      messages: '메시지 수',
      modelBreakdown: '모델별 사용량',
      dailyBreakdown: '일별 사용량',
      monthlyBreakdown: '월별 사용량',
      hourlyBreakdown: '시간별 사용량',
      date: '날짜',
      yesterday: '어제',
      dataDirectory: '데이터 디렉터리',
      noDataMessage: '아직 사용 데이터가 없습니다.',
      errorMessage: '사용 데이터 로드 중 오류가 발생했습니다.',
      clickForDetails: '클릭하여 상세 보기',
      trend: '추세',
    },
    settings: {
      title: 'Claude Code 사용량 설정',
      refreshInterval: '새로고침 간격(초)',
      dataDirectory: 'Claude 데이터 디렉터리',
      language: '언어',
      decimalPlaces: '소수점 자릿수',
      codexEnabled: 'Codex 데이터 활성화',
      codexIncludeArchived: 'Codex 보관 세션 포함',
      codexDataDirectory: 'Codex 데이터 디렉터리',
    },
    overview: {
      heatmap: {
        legend: '활동 히트맵',
      },
      stats: {
        favoriteModel: '선호 모델',
        totalTokens: '총 토큰',
        sessions: '세션 수',
        longestSession: '최장 세션',
        activeDays: '활동 일수',
        mostActiveDay: '가장 활발한 날',
        longestStreak: '최장 연속 기록',
        currentStreak: '현재 연속 기록',
      },
      funFact: {
        template: '{label} 대비 약 {multiplier}배',
      },
    },
    provider: {
      pill: {
        overview: '개요',
        claude: 'Claude',
        codex: 'Codex',
      },
      badge: {
        claude: '[Claude]',
        codex: '[Codex]',
      },
    },
    reasoning: {
      label: '추론',
      tooltip: '추론 출력 토큰',
    },
    listPriceFootnote: '공식 모델 가격 기준 추정치입니다(list-price equivalent).',
    codex: {
      config: {
        enabled: 'Codex 통합 활성화',
        includeArchived: '보관 세션 포함',
        dataDirectory: 'Codex 데이터 디렉터리',
      },
    },
  },
} satisfies Record<SupportedLanguage, Translations>;

const translations: Record<SupportedLanguage, Translations> = localeCatalog;

export class I18n {
  private static currentLanguage: SupportedLanguage = 'en';

  static setLanguage(lang: SupportedLanguage | 'auto'): void {
    if (lang === 'auto') {
      this.currentLanguage = this.detectLanguage();
    } else {
      this.currentLanguage = lang;
    }
  }

  static getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  static get t(): Translations {
    return translations[this.currentLanguage];
  }

  private static detectLanguage(): SupportedLanguage {
    const locale = (process.env.LANG || process.env.LANGUAGE || 'en').toLowerCase();

    if (locale.includes('zh')) {
      if (locale.includes('tw') || locale.includes('hk') || locale.includes('mo')) {
        return 'zh-TW';
      }
      return 'zh-CN';
    }
    if (locale.includes('ja')) return 'ja';
    if (locale.includes('ko')) return 'ko';
    if (locale.includes('de')) return 'de-DE';
    return 'en';
  }

  static formatCurrency(amount: number, decimalPlaces: number = 2): string {
    return `$${amount.toFixed(decimalPlaces)}`;
  }

  static formatNumber(num: number): string {
    return num.toLocaleString();
  }
}
