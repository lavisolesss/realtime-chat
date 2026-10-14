// 在線名單（docs/architecture.md 第 7.3 節）。手機是右側滑出的面板；寬螢幕時常駐在右邊。

import type { ChatStore } from '../state/store';
import { stripHiddenChars } from '../lib/validate';
import { button, h, tagElement } from './dom';

const WIDE_QUERY = '(min-width: 860px)';

export interface OnlineList {
  el: HTMLElement;
  scrim: HTMLElement;
  open(): void;
  close(): void;
}

export function createOnlineList(store: ChatStore): OnlineList {
  const aside = h('aside', 'roster', undefined, { 'aria-label': '在線名單' });
  const title = h('h2');
  const close = button('icon-btn close-roster', '×', () => setOpen(false), { 'aria-label': '關閉在線名單' });
  const head = h('div', 'roster-head');
  head.append(title, close);
  const list = h('ul');
  aside.append(head, list);

  const scrim = h('div', 'scrim');
  scrim.addEventListener('click', () => setOpen(false));

  const wide = window.matchMedia(WIDE_QUERY);
  let open = false;

  function setOpen(next: boolean): void {
    open = next;
    aside.hidden = !wide.matches && !open;
    scrim.hidden = wide.matches || !open;
    if (open && !wide.matches) close.focus();
  }

  function render(): void {
    const me = store.identity.userId;
    const users = [...store.presence].sort((a, b) => {
      if (a.userId === me) return -1;
      if (b.userId === me) return 1;
      return a.onlineAt.localeCompare(b.onlineAt);
    });
    title.textContent = `目前 ${Math.max(1, users.length)} 人在線`;
    list.replaceChildren(
      ...users.map((user) => {
        const li = h('li');
        li.append(h('span', 'nick', stripHiddenChars(user.nickname)), tagElement(user.tag));
        if (user.userId === me) li.append(h('span', 'you', '（你）'));
        return li;
      }),
    );
  }

  aside.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) setOpen(false);
  });
  wide.addEventListener('change', () => setOpen(false));
  store.events.on('presence', render);
  store.events.on('identity', render);

  render();
  setOpen(false);
  return { el: aside, scrim, open: () => setOpen(true), close: () => setOpen(false) };
}
