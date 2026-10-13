// 改暱稱視窗、刪除確認視窗（docs/architecture.md 第 7.2、7.4 節）。
// 使用瀏覽器內建的 <dialog>：Esc 關閉、焦點鎖在視窗裡都是內建的。

import type { ChatStore } from '../state/store';
import { MAX_NICKNAME_LENGTH } from '../types';
import { charLength, cleanNickname, nicknameError } from '../lib/validate';
import { button, h, tagElement } from './dom';

function closeOnBackdropClick(dialog: HTMLDialogElement): void {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export function createNicknameDialog(store: ChatStore): { el: HTMLDialogElement; open(): void } {
  const dialog = h('dialog', 'dialog', undefined, { 'aria-labelledby': 'nick-title' });
  const form = h('form', 'dialog-body', undefined, { method: 'dialog' });

  const input = h('input', undefined, undefined, { id: 'nick-input', autocomplete: 'off', maxlength: 40 });
  const counter = h('span', 'counter');
  const fieldRow = h('div', 'field-row');
  fieldRow.append(input, counter);
  const error = h('span', 'field-error', undefined, { 'aria-live': 'polite' });
  const field = h('div', 'field');
  field.append(h('label', undefined, '暱稱', { for: 'nick-input' }), fieldRow, error);

  const note = h('p');
  const save = h('button', 'btn btn-primary btn-sm', '儲存', { type: 'submit' });
  const actions = h('div', 'dialog-actions');
  actions.append(button('btn btn-ghost btn-sm', '取消', () => dialog.close()), save);

  form.append(h('h2', undefined, '改暱稱', { id: 'nick-title' }), field, note, actions);
  dialog.append(form);
  closeOnBackdropClick(dialog);

  const refresh = () => {
    const cleaned = cleanNickname(input.value);
    counter.textContent = `${charLength(cleaned)} / ${MAX_NICKNAME_LENGTH}`;
    const problem = nicknameError(cleaned);
    counter.classList.toggle('over', charLength(cleaned) > MAX_NICKNAME_LENGTH);
    error.textContent = problem ?? '';
    save.disabled = problem !== null;
  };
  input.addEventListener('input', refresh);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const problem = await store.setNickname(input.value);
    if (problem) {
      error.textContent = problem;
      return;
    }
    dialog.close();
  });

  return {
    el: dialog,
    open() {
      input.value = store.identity.nickname;
      note.replaceChildren('你的辨識碼 ', tagElement(store.identity.tag), ' 不會改變，別人靠它分辨你。');
      refresh();
      dialog.showModal();
      input.select();
    },
  };
}

export function createDeleteDialog(store: ChatStore): { el: HTMLDialogElement; open(id: string): void } {
  const dialog = h('dialog', 'dialog', undefined, { role: 'alertdialog', 'aria-labelledby': 'del-title' });
  const body = h('div', 'dialog-body');
  let targetId = '';

  const confirm = button('btn btn-danger btn-sm', '刪除', async () => {
    confirm.disabled = true;
    await store.remove(targetId);
    confirm.disabled = false;
    dialog.close();
  });
  const cancel = button('btn btn-ghost btn-sm', '取消', () => dialog.close());
  const actions = h('div', 'dialog-actions');
  actions.append(cancel, confirm);

  body.append(h('h2', undefined, '刪除訊息', { id: 'del-title' }), h('p', undefined, '確定要刪除這則訊息嗎？刪除後無法復原。'), actions);
  dialog.append(body);
  closeOnBackdropClick(dialog);

  return {
    el: dialog,
    open(id) {
      targetId = id;
      dialog.showModal();
      cancel.focus();
    },
  };
}
