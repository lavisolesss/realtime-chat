-- 匿名即時聊天室：資料表、伺服器端檢查、RLS、Realtime
-- 對照 docs/architecture.md 第 3.3、5.1、6.3、9.1 節。
-- 使用方式：貼到 Supabase 的 SQL Editor 按 Run。重複執行也不會出錯。

-- ============================================================
-- 1. 資料表
-- ============================================================
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nickname    text not null,
  tag         text not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  updated_at  timestamptz not null default now(),

  -- 暱稱 1～20 字，不能只有空白
  constraint messages_nickname_check
    check (char_length(nickname) between 1 and 20 and nickname ~ '\S'),
  -- 訊息 1～500 字、不能只有空白；已刪除的訊息內容一定是空字串
  constraint messages_content_check
    check (
      (deleted_at is null and char_length(content) <= 500 and content ~ '\S')
      or (deleted_at is not null and content = '')
    )
);

comment on table public.messages is '聊天室訊息。刪除是清空內容並記錄 deleted_at，不整筆刪掉。';

-- 載入最近／更早的訊息
create index if not exists messages_created_at_idx on public.messages (created_at desc, id desc);
-- 斷線重連時補資料
create index if not exists messages_updated_at_idx on public.messages (updated_at);
-- 防洗版檢查
create index if not exists messages_user_created_idx on public.messages (user_id, created_at desc);

-- ============================================================
-- 2. 新增訊息時：伺服器填入身分、辨識碼、時間，並檢查 1 秒限制
-- ============================================================
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  -- 前端送什麼都不算數，一律由伺服器決定
  new.id         := gen_random_uuid();
  new.user_id    := uid;
  new.tag        := substr(replace(uid::text, '-', ''), 1, 4);
  new.created_at := now();
  new.updated_at := now();
  new.edited_at  := null;
  new.deleted_at := null;

  -- 同一個身分 1 秒內不能送第二則
  if exists (
    select 1 from public.messages m
    where m.user_id = uid and m.created_at > now() - interval '1 second'
  ) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ============================================================
-- 3. 編輯、刪除時：只允許改內容或標記刪除，其他欄位不能動
-- ============================================================
create or replace function public.messages_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'message_deleted' using errcode = 'P0001';
  end if;

  -- 這些欄位不能被修改
  new.id         := old.id;
  new.user_id    := old.user_id;
  new.tag        := old.tag;
  new.nickname   := old.nickname;
  new.created_at := old.created_at;

  if new.deleted_at is not null then
    -- 刪除：清空內容並記錄刪除時間
    new.content    := '';
    new.deleted_at := now();
    new.edited_at  := old.edited_at;
  else
    new.deleted_at := null;
    new.edited_at  := case when new.content is distinct from old.content then now() else old.edited_at end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists messages_before_update on public.messages;
create trigger messages_before_update
  before update on public.messages
  for each row execute function public.messages_before_update();

-- ============================================================
-- 4. 權限：只有登入（含匿名登入）的人可以用，而且不能整筆刪除
-- ============================================================
revoke all on public.messages from anon, authenticated;
grant select, insert, update on public.messages to authenticated;

alter table public.messages enable row level security;

drop policy if exists "messages: anyone signed in can read" on public.messages;
create policy "messages: anyone signed in can read"
  on public.messages for select
  to authenticated
  using (true);

drop policy if exists "messages: send as yourself" on public.messages;
create policy "messages: send as yourself"
  on public.messages for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "messages: edit or delete your own" on public.messages;
create policy "messages: edit or delete your own"
  on public.messages for update
  to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null)
  with check (user_id = (select auth.uid()));

-- 沒有 delete 規則 = 任何人都不能整筆刪除

-- ============================================================
-- 5. 開啟 Realtime：資料表一有變動就推給大家
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
