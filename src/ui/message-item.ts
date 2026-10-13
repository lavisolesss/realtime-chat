// 單則訊息與編輯模式（docs/architecture.md 第 7.1、7.5 節）。

import type { ChatStore } from '../state/store';
import { MAX_CONTENT_LENGTH, type Message } from '../types';
import { formatTime } from '../lib/time';
import { renderTextWithLinks } from '../lib/linkify';
import { charLength, cleanContent } from '../lib/validate';
import { button, h, tagElement } from './dom';

export interface MessageItem {
  el: HTMLElement;
  update(message: Message): void;
}

export function createMessageItem(message: Message, store: ChatStore, actions: { onDelete: (id: string) => void }): MessageItem {
  const mine = store.isMine(message);
  const el = h('article', mine ? 'msg mine' : 'msg', undefined, { 'data-id': message.id });

  const edited = h('span', 'edited', '（已編輯）');
  const meta = h('div', 'meta');
  meta.append(
    h('span', 'nick', message.nickname),
    tagElement(message.tag),
    h('time', 'time', formatTime(message.createdAt), { datetime: message.createdAt }),
    edited,
  );

  const bubble = h('div', 'bubble');
  el.append(meta, bubble);

  let current = message;
  const render = () => {
    renderTextWithLinks(bubble, current.content);
    edited.hidden = !current.editedAt;
  };
  render();

  if (mine) {
    const actionsRow = h('div', 'actions');
    actionsRow.append(
      button('act', '編輯', () => startEditing()),
      button('act danger', '刪除', () => actions.onDelete(current.id)),
    );
    el.append(actionsRow);
    // 手機沒有滑鼠移過去的效果，點一下自己的訊息才顯示按鈕
    bubble.addEventListener('click', () => {
      const wasShown = el.classList.contains('show-actions');
      el.parentElement?.querySelectorAll('.msg.show-actions').forEach((x) => x.classList.remove('show-actions'));
      el.classList.toggle('show-actions', !wasShown);
    });
  }

  function startEditing(): void {
    if (el.querySelector('.edit-box')) return;
    const box = h('div', 'edit-box');
    const input = h('textarea', undefined, undefined, { 'aria-label': '編輯訊息', rows: 3 });
    input.value = current.content;
    const counter = h('span', 'counter');
    const save = button('btn btn-primary btn-sm', '儲存', () => void submit());
    const cancel = button('btn btn-ghost btn-sm', '取消', () => stop());
    const row = h('div', 'edit-row');
    row.append(counter, cancel, save);
    box.append(input, row);

    const refresh = () => {
      const text = cleanContent(input.value);
      const length = charLength(text);
      counter.textContent = `${length} / ${MAX_CONTENT_LENGTH}`;
      counter.classList.toggle('over', length > MAX_CONTENT_LENGTH);
      save.disabled = length === 0 || length > MAX_CONTENT_LENGTH || text === current.content;
    };
    const submit = async () => {
      if (save.disabled) return;
      save.disabled = true;
      if (await store.edit(current.id, input.value)) stop();
      else refresh();
    };
    const stop = () => {
      box.replaceWith(bubble);
      el.classList.remove('editing');
    };

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        stop();
      } else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        void submit();
      }
    });

    refresh();
    bubble.replaceWith(box);
    el.classList.add('editing');
    el.classList.remove('show-actions');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  return {
    el,
    update(next) {
      current = next;
      render();
    },
  };
}
