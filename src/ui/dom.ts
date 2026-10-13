// 建立畫面元素的小工具。文字一律用 textContent 放進去，不使用 innerHTML。

import { tagHue } from '../lib/identity';

type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
  attrs: Attrs = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  return el;
}

/** 「●#a3f9」辨識碼標籤，圓點顏色由辨識碼決定 */
export function tagElement(tag: string): HTMLSpanElement {
  const el = h('span', 'tag', `#${tag}`);
  el.style.setProperty('--h', String(tagHue(tag)));
  return el;
}

export function button(className: string, text: string, onClick: (event: MouseEvent) => void, attrs: Attrs = {}): HTMLButtonElement {
  const el = h('button', className, text, { type: 'button', ...attrs });
  el.addEventListener('click', onClick);
  return el;
}
