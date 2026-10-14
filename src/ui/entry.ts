// 進入畫面：先輸入代號（暱稱）、按「進入」，才進到聊天室（docs/architecture.md 第 6.1、7.0 節）。

import { MAX_NICKNAME_LENGTH } from '../types';
import { randomNickname } from '../lib/identity';
import { charLength, cleanNickname, nicknameError } from '../lib/validate';
import { button, h } from './dom';

/**
 * 顯示進入畫面，按下「進入」後呼叫 onEnter(暱稱)。
 * onEnter 執行期間按鈕顯示「進入中…」；失敗時回到可以再按一次的狀態。
 */
export function createEntryScreen(savedNickname: string, onEnter: (nickname: string) => Promise<void>): HTMLElement {
  const input = h('input', undefined, undefined, {
    id: 'entry-input',
    autocomplete: 'off',
    maxlength: 40,
    placeholder: '例如：小明',
    enterkeyhint: 'go',
  });
  input.value = savedNickname;
  const counter = h('span', 'counter');
  const fieldRow = h('div', 'field-row');
  fieldRow.append(input, counter);
  const error = h('span', 'field-error', undefined, { 'aria-live': 'polite' });
  const dice = button('btn btn-ghost btn-sm', '隨機產生', () => {
    input.value = randomNickname();
    touched = true;
    refresh();
    input.focus();
  });
  const labelRow = h('div', 'entry-label-row');
  labelRow.append(h('label', undefined, `你的代號（1～${MAX_NICKNAME_LENGTH} 字）`, { for: 'entry-input' }), dice);
  const field = h('div', 'field');
  field.append(labelRow, fieldRow, error);

  const enter = h('button', 'btn btn-primary entry-submit', '進入聊天室', { type: 'submit' });
  const form = h('form', 'entry-card', undefined, { 'aria-labelledby': 'entry-title', novalidate: true });
  form.append(
    h('h1', 'entry-title', '匿名聊天室', { id: 'entry-title' }),
    h('p', 'entry-lead', '輸入一個代號就能開始聊天，不用註冊。代號後面會自動加上 4 碼辨識碼，別人靠它分辨你。'),
    field,
    enter,
  );

  const screen = h('main', 'entry');
  screen.append(form);

  // 還沒打字前不顯示「不能是空的」，免得一打開就看到紅字
  let touched = savedNickname !== '';
  let busy = false;
  const refresh = () => {
    const cleaned = cleanNickname(input.value);
    counter.textContent = `${charLength(cleaned)} / ${MAX_NICKNAME_LENGTH}`;
    counter.classList.toggle('over', charLength(cleaned) > MAX_NICKNAME_LENGTH);
    const problem = nicknameError(cleaned);
    error.textContent = touched ? (problem ?? '') : '';
    enter.disabled = busy || problem !== null;
  };
  input.addEventListener('input', () => {
    touched = true;
    refresh();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nickname = cleanNickname(input.value);
    touched = true;
    if (busy || nicknameError(nickname)) {
      refresh();
      return;
    }
    busy = true;
    input.disabled = true;
    dice.disabled = true;
    enter.textContent = '進入中…';
    refresh();
    try {
      await onEnter(nickname);
    } catch (problem) {
      console.error(problem);
      busy = false;
      input.disabled = false;
      dice.disabled = false;
      enter.textContent = '進入聊天室';
      refresh();
      error.textContent = '連線失敗，請再按一次「進入聊天室」。';
    }
  });

  refresh();
  return screen;
}
