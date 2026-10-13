// 時間與日期格式：訊息顯示「時:分」，跨日插入「10 月 13 日」分隔線。

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 同一天的訊息會得到同一個 key */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  const base = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${d.getFullYear()} 年 ${base}`;
}
