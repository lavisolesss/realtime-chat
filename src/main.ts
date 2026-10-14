// 程式起點：決定用哪個 Transport，組裝畫面（docs/architecture.md 第 4.3、6.1 節）。

import './styles.css';
import { supabaseConfig } from './config';
import { LocalTransport } from './transport/local-transport';
import { SupabaseTransport } from './transport/supabase-transport';
import type { ChatTransport } from './transport/transport';
import { ChatStore } from './state/store';
import { loadIdentity } from './lib/identity';
import { h } from './ui/dom';
import { createHeader } from './ui/header';
import { createBanners } from './ui/banners';
import { createMessageList } from './ui/message-list';
import { createComposer } from './ui/composer';
import { createOnlineList } from './ui/online-list';
import { createDeleteDialog, createNicknameDialog } from './ui/dialogs';

// 有 Supabase 設定就用 SupabaseTransport，沒有就是示範模式；畫面程式完全一樣
function createTransport(): ChatTransport {
  return supabaseConfig ? new SupabaseTransport(supabaseConfig) : new LocalTransport();
}

function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

async function start(root: HTMLElement): Promise<void> {
  const transport = createTransport();
  // 示範模式的身分跟著分頁走（sessionStorage），開兩個分頁才像兩個人；接上 Supabase 後改存 localStorage
  const identityStorage = safeStorage(transport.mode === 'demo' ? 'sessionStorage' : 'localStorage');
  const userId = await transport.signIn();
  const store = new ChatStore(transport, loadIdentity(identityStorage, userId), identityStorage);

  const nicknameDialog = createNicknameDialog(store);
  const deleteDialog = createDeleteDialog(store);
  const onlineList = createOnlineList(store);

  const body = h('div', 'body');
  body.append(createMessageList(store, { onDelete: (id) => deleteDialog.open(id) }), onlineList.scrim, onlineList.el);

  const app = h('div', 'app');
  app.append(
    createHeader(store, { onEditNickname: () => nicknameDialog.open(), onOpenRoster: () => onlineList.open() }),
    createBanners(store),
    body,
    createComposer(store),
    nicknameDialog.el,
    deleteDialog.el,
  );
  root.replaceChildren(app);

  await store.start();
  document.getElementById('composer-input')?.focus({ preventScroll: true });
}

const root = document.getElementById('app');
if (root) {
  start(root).catch((error) => {
    console.error(error);
    root.textContent = '聊天室載入失敗，請重新整理頁面。';
  });
}
