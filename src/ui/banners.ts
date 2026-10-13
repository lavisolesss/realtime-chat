// 示範模式橫幅、連線狀態橫幅（docs/architecture.md 第 7.1 節）。

import type { ChatStore } from '../state/store';
import { h } from './dom';

export function createBanners(store: ChatStore): HTMLElement {
  const wrap = h('div', 'banners');

  if (store.mode === 'demo') {
    const demo = h('div', 'banner banner-demo');
    demo.append(h('b', undefined, '示範模式'), h('span', undefined, '訊息只存在你的瀏覽器，不會傳給其他人'));
    wrap.append(demo);
  }

  const offline = h('div', 'banner banner-offline', undefined, { role: 'status' });
  offline.append(h('span', 'spinner', undefined, { 'aria-hidden': 'true' }), h('span', undefined, '連線中斷，正在重新連線…'));
  offline.hidden = true;
  wrap.append(offline);

  store.events.on('status', (status) => {
    offline.hidden = status !== 'reconnecting';
  });
  return wrap;
}
