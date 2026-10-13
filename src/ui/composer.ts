// 輸入區：多行輸入框、字數計數器、送出按鈕、提示文字（docs/architecture.md 第 6.2、7.1 節）。

import type { ChatStore } from '../state/store';
import { MAX_CONTENT_LENGTH } from '../types';
import { charLength, cleanContent } from '../lib/validate';
import { button, h } from './dom';

const HINT_MS = 3000;
const MAX_INPUT_HEIGHT_PX = 140;

export function createComposer(store: ChatStore): HTMLElement {
  const footer = h('footer', 'composer');
  const hint = h('span', 'hint', undefined, { role: 'status' });
  hint.hidden = true;

  const input = h('textarea', undefined, undefined, {
    id: 'composer-input',
    rows: 1,
    placeholder: '說點什麼…（Enter 送出，Shift＋Enter 換行）',
    'aria-label': '輸入訊息',
  });
  const counter = h('span', 'counter');
  const shell = h('div', 'input-shell');
  shell.append(input, counter);

  const send = button('btn btn-primary', '送出', () => void submit());
  const row = h('div', 'compose-row');
  row.append(shell, send);
  footer.append(hint, row);

  let hintTimer: number | undefined;
  let cooldownTimer: number | undefined;

  function showHint(text: string): void {
    hint.textContent = text;
    hint.hidden = false;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hint.hidden = true), HINT_MS);
  }

  function refresh(): void {
    const length = charLength(cleanContent(input.value));
    counter.textContent = `${length} / ${MAX_CONTENT_LENGTH}`;
    counter.classList.toggle('over', length > MAX_CONTENT_LENGTH);
    send.disabled = length === 0 || length > MAX_CONTENT_LENGTH || !store.canSend || store.cooldown.active;
  }

  function autosize(): void {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`;
  }

  async function submit(): Promise<void> {
    // 冷卻中、斷線中、空白、超過字數時，store 會發出提示，輸入框內容保留
    if (await store.send(input.value)) {
      input.value = '';
      autosize();
      window.clearTimeout(cooldownTimer);
      cooldownTimer = window.setTimeout(refresh, store.cooldown.remaining() + 20);
    }
    refresh();
  }

  input.addEventListener('input', () => {
    refresh();
    autosize();
  });
  input.addEventListener('keydown', (event) => {
    // 中文輸入法選字時按 Enter 不送出
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
  });

  store.events.on('notice', showHint);
  store.events.on('status', refresh);
  refresh();
  return footer;
}
