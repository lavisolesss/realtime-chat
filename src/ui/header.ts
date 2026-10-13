// 頂部列：聊天室名稱、我的暱稱＋辨識碼、「N 人在線」（docs/architecture.md 第 7.1 節）。

import type { ChatStore } from '../state/store';
import { button, h, tagElement } from './dom';

export function createHeader(store: ChatStore, actions: { onEditNickname: () => void; onOpenRoster: () => void }): HTMLElement {
  const meName = h('span', 'me-name');
  const meTag = h('span');
  const meButton = button('chip-btn', '', actions.onEditNickname, { title: '改暱稱' });
  meButton.append(meName, meTag);

  const onlineCount = h('span');
  const onlineButton = button('chip-btn online-chip', '', actions.onOpenRoster, { title: '查看在線名單' });
  onlineButton.append(h('span', 'online-dot', undefined, { 'aria-hidden': 'true' }), onlineCount);

  const header = h('header', 'topbar');
  header.append(h('h1', 'room-name', '匿名聊天室'), h('span', 'spacer'), meButton, onlineButton);

  const renderIdentity = () => {
    meName.textContent = store.identity.nickname;
    meTag.replaceChildren(tagElement(store.identity.tag));
  };
  const renderOnline = () => {
    onlineCount.textContent = `${Math.max(1, store.presence.length)} 人在線`;
  };

  renderIdentity();
  renderOnline();
  store.events.on('identity', renderIdentity);
  store.events.on('presence', renderOnline);
  return header;
}
