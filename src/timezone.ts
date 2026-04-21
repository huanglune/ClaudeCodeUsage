const AUTO_TIMEZONE = 'auto';

export function resolveTimeZone(setting: string | undefined): string {
  const raw = (setting || '').trim();
  if (raw === '' || raw === AUTO_TIMEZONE) {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }
  return raw;
}

export function formatTzDateHour(instant: Date, timeZone: string): { date: string; hour: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(instant);

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  // 某些实现对 00:00 会返回 "24"，统一成 "00"
  const hour = map.hour === '24' ? '00' : map.hour;
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hour,
  };
}
