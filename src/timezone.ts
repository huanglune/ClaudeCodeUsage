const AUTO_TIMEZONE = 'auto';

// VSCode settings.json 是自由 JSON，package.json 的 enum 只是 UI 提示。
// 用户手写无效的 IANA ID 时，formatTzDateHour 里 Intl.DateTimeFormat 会抛
// RangeError 把整个刷新循环打挂。这里统一做一次运行时校验，失败退回 UTC。
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(setting: string | undefined): string {
  const raw = (setting || '').trim();
  if (raw === '' || raw === AUTO_TIMEZONE) {
    try {
      const system = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return system && isValidTimeZone(system) ? system : 'UTC';
    } catch {
      return 'UTC';
    }
  }
  return isValidTimeZone(raw) ? raw : 'UTC';
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
