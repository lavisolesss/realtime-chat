// 讀取 Supabase 設定；沒有設定就是示範模式（docs/architecture.md 第 4.3 節「自動切換」）。

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const supabaseConfig: SupabaseConfig | null = url && publishableKey ? { url, publishableKey } : null;
