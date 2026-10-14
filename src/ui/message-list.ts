// 訊息列表、日期分隔線、載入更早的訊息、「↓ 有 N 則新訊息」、空狀態
// （docs/architecture.md 第 6.5、7.1 節，需求共識第 2、11、12 項）。

import type { ChatStore, MessagesChange } from '../state/store';
import { RETENTION_DAYS } from '../types';
import { dayKey, formatDay } from '../lib/time';
import { button, h } from './dom';
import { createMessageItem, type MessageItem } from './message-item';

const NEAR_BOTTOM_PX = 48;
const NEAR_TOP_PX = 80;

export function createMessageList(store: ChatStore, actions: { onDelete: (id: string) => void }): HTMLElement {
  const wrap = h('div', 'list-wrap');
  const list = h('div', 'list', undefined, { 'aria-live': 'polite', 'aria-label': '訊息' });
  const top = h('div', 'list-top');
  const messagesEl = h('div', 'messages');
  const empty = h('div', 'empty');
  empty.append(h('strong', undefined, '還沒有人說話'), h('span', undefined, '來打個招呼吧！'));
  const pill = button('new-pill', '', () => scrollToBottom('smooth'));
  pill.hidden = true;

  list.append(top, messagesEl, empty);
  wrap.append(list, pill);

  const items = new Map<string, MessageItem>();
  let unread = 0;

  const isNearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_BOTTOM_PX;

  function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
    list.scrollTo({ top: list.scrollHeight, behavior });
    setUnread(0);
  }

  function setUnread(count: number): void {
    unread = count;
    pill.hidden = count === 0;
    pill.textContent = `↓ 有 ${count} 則新訊息`;
  }

  function itemFor(id: string): MessageItem {
    let item = items.get(id);
    if (!item) {
      const message = store.messages.find((m) => m.id === id)!;
      item = createMessageItem(message, store, actions);
      items.set(id, item);
    }
    return item;
  }

  function daySeparator(iso: string): HTMLElement {
    return h('div', 'day', formatDay(iso), { 'data-day': dayKey(iso), role: 'separator' });
  }

  /** 全部重排：初次載入、載入更早的、順序變動時使用 */
  function rebuild(): void {
    const nodes: HTMLElement[] = [];
    let lastDay = '';
    for (const message of store.messages) {
      const day = dayKey(message.createdAt);
      if (day !== lastDay) {
        nodes.push(daySeparator(message.createdAt));
        lastDay = day;
      }
      nodes.push(itemFor(message.id).el);
    }
    const alive = new Set(store.messages.map((m) => m.id));
    for (const id of items.keys()) if (!alive.has(id)) items.delete(id);
    messagesEl.replaceChildren(...nodes);
  }

  /** 新訊息加到最後面；不重排其他訊息，避免打斷正在編輯的輸入框 */
  function appendLast(): void {
    const message = store.messages[store.messages.length - 1];
    const previous = store.messages[store.messages.length - 2];
    if (!previous || dayKey(previous.createdAt) !== dayKey(message.createdAt)) {
      messagesEl.append(daySeparator(message.createdAt));
    }
    messagesEl.append(itemFor(message.id).el);
  }

  function removeItem(id: string): void {
    const item = items.get(id);
    if (!item) return;
    items.delete(id);
    const before = item.el.previousElementSibling;
    const after = item.el.nextElementSibling;
    item.el.remove();
    // 這一天已經沒有訊息了，就把日期分隔線也拿掉
    if (before?.classList.contains('day') && (!after || after.classList.contains('day'))) before.remove();
  }

  function renderEmpty(): void {
    const isEmpty = store.messages.length === 0;
    empty.hidden = !isEmpty;
    top.hidden = isEmpty;
  }

  function onChange(change: MessagesChange): void {
    const wasNearBottom = isNearBottom();
    switch (change.kind) {
      case 'reset':
        rebuild();
        scrollToBottom();
        break;
      case 'prepend': {
        const previousHeight = list.scrollHeight;
        const previousTop = list.scrollTop;
        rebuild();
        // 補在上方後維持原本看的位置
        list.scrollTop = previousTop + (list.scrollHeight - previousHeight);
        break;
      }
      case 'append':
        appendLast();
        if (change.mine || wasNearBottom) scrollToBottom();
        else setUnread(unread + 1);
        break;
      case 'sync':
        rebuild();
        if (wasNearBottom) scrollToBottom();
        break;
      case 'update':
        items.get(change.id)?.update(store.messages.find((m) => m.id === change.id)!);
        break;
      case 'remove':
        removeItem(change.id);
        break;
    }
    renderEmpty();
  }

  store.events.on('messages', onChange);
  // 斷線時停用所有「編輯」「刪除」按鈕
  store.events.on('status', () => {
    list.querySelectorAll<HTMLButtonElement>('.act').forEach((b) => (b.disabled = !store.canSend));
  });
  store.events.on('older', ({ loading, hasMore }) => {
    top.replaceChildren();
    if (loading) top.append(h('span', 'spinner', undefined, { 'aria-hidden': 'true' }), h('span', undefined, '載入中…'));
    else if (!hasMore) top.textContent = store.mode === 'demo' ? '已經是最早的訊息' : `已經是最早的訊息（只保留最近 ${RETENTION_DAYS} 天）`;
  });

  list.addEventListener('scroll', () => {
    if (isNearBottom() && unread) setUnread(0);
    if (list.scrollTop < NEAR_TOP_PX) void store.loadOlder();
  }, { passive: true });

  renderEmpty();
  return wrap;
}
