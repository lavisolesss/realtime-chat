// 時間與日期格式：訊息顯示「時:分」，跨日插入「10 月 13 日」分隔線。

const pad = (n: number) => String(n).padStart(2, '0');

/** 資料庫的時間有 6 位小數（例如 .123456），有些瀏覽器讀不懂，先截成 3 位 */
function toDate(iso: string): Date {
  return new Date(iso.replace(/\.(\d+)/, (_, fraction: string) => `.${(fraction + '00').slice(0, 3)}`));
}

export function formatTime(iso: string): string {
  const d = toDate(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 同一天的訊息會得到同一個 key */
export function dayKey(iso: string): string {
  const d = toDate(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatDay(iso: string): string {
  const d = toDate(iso);
  const base = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${d.getFullYear()} 年 ${base}`;
}
