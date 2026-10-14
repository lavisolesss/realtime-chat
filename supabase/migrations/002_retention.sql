-- 訊息保存期限：每天自動清除超過 30 天的訊息，並且最多只留最新 5000 則
-- 對照 docs/architecture.md 第 9.4 節「訊息保存的限制」。
-- 使用方式：貼到 Supabase 的 SQL Editor 按 Run。重複執行也不會出錯。
-- 數字要改的話，前端 src/types.ts 的 RETENTION_DAYS、RETENTION_MAX_MESSAGES 也要一起改（畫面上的提示文字用它們）。

-- ============================================================
-- 1. 開啟 pg_cron（資料庫內建的排程工具，免費方案就有）
-- ============================================================
create extension if not exists pg_cron with schema pg_catalog;

-- ============================================================
-- 2. 清除函式：整筆刪掉，不是只清空內容
-- ============================================================
create or replace function public.purge_old_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer := 0;
  n integer;
begin
  -- 超過 30 天的訊息（包含已刪除、只剩空殼的訊息）
  delete from public.messages
  where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  removed := removed + n;

  -- 30 天內如果超過 5000 則，只留最新的 5000 則
  delete from public.messages
  where id in (
    select id from public.messages
    order by created_at desc, id desc
    offset 5000
  );
  get diagnostics n = row_count;
  removed := removed + n;

  return removed;
end;
$$;

comment on function public.purge_old_messages() is '刪除超過 30 天或超出最新 5000 則的訊息；由 pg_cron 每天執行。';

-- 只給排程（資料庫管理者）用，網頁上的使用者不能呼叫
revoke all on function public.purge_old_messages() from public, anon, authenticated;

-- ============================================================
-- 3. 排程：每天台灣時間凌晨 4:00（UTC 20:00）執行一次
--    同名排程已存在時，cron.schedule 會直接更新它，不會重複建立
-- ============================================================
select cron.schedule('purge-old-messages', '0 20 * * *', 'select public.purge_old_messages()');

-- 部署後立刻清一次，不用等到第一次排程
select public.purge_old_messages();
