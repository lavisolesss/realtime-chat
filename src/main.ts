// 程式起點：先顯示進入畫面輸入代號，按「進入」後才連線、組裝聊天畫面（docs/architecture.md 第 4.3、6.1 節）。

import './styles.css';
import { supabaseConfig } from './config';
import { LocalTransport } from './transport/local-transport';
import { SupabaseTransport } from './transport/supabase-transport';
import type { ChatTransport } from './transport/transport';
import { ChatStore } from './state/store';
import { createIdentity, loadSavedNickname, saveNickname } from './lib/identity';
import { h } from './ui/dom';
import { createHeader } from './ui/header';
import { createBanners } from './ui/banners';
import { createMessageList } from './ui/message-list';
import { createComposer } from './ui/composer';
import { createOnlineList } from './ui/online-list';
import { createDeleteDialog, createNicknameDialog } from './ui/dialogs';
import { createEntryScreen } from './ui/entry';

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

function start(root: HTMLElement): void {
  const transport = createTransport();
  // 示範模式的身分跟著分頁走（sessionStorage），開兩個分頁才像兩個人；接上 Supabase 後改存 localStorage
  const identityStorage = safeStorage(transport.mode === 'demo' ? 'sessionStorage' : 'localStorage');
  // 每次打開都先停在進入畫面；上次用過的代號會預填，但還是要按「進入」
  root.replaceChildren(
    createEntryScreen(loadSavedNickname(identityStorage), async (nickname) => {
      saveNickname(identityStorage, nickname);
      await enterChat(root, transport, identityStorage, nickname);
    }),
  );
  document.getElementById('entry-input')?.focus({ preventScroll: true });
}

async function enterChat(root: HTMLElement, transport: ChatTransport, identityStorage: Storage | null, nickname: string): Promise<void> {
  const userId = await transport.signIn();
  const store = new ChatStore(transport, createIdentity(userId, nickname), identityStorage);

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

  // 已經離開進入畫面，之後載入失敗就不回進入畫面，直接請使用者重新整理
  store
    .start()
    .then(() => document.getElementById('composer-input')?.focus({ preventScroll: true }))
    .catch(showLoadError);
}

function showLoadError(error: unknown): void {
  console.error(error);
  if (root) root.textContent = '聊天室載入失敗，請重新整理頁面。';
}

const root = document.getElementById('app');
if (root) {
  try {
    start(root);
  } catch (error) {
    showLoadError(error);
  }
}
