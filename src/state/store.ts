// 狀態管理：訊息、在線名單、連線狀態（docs/architecture.md 第 4.3 節）。
// 畫面只跟這裡打交道，不知道訊息是從分頁還是從 Supabase 來的。

import type { ChatTransport, TransportMode } from '../transport/transport';
import {
  ChatError,
  ERROR_MESSAGES,
  PAGE_SIZE,
  type ConnectionStatus,
  type ErrorCode,
  type Identity,
  type Message,
  type PresenceUser,
} from '../types';
import { Emitter } from '../transport/transport';
import { Cooldown } from '../lib/rate-limit';
import { cleanContent, cleanNickname, nicknameError, validateContent } from '../lib/validate';
import { saveNickname } from '../lib/identity';

/** 訊息列表怎麼變的，讓畫面決定要不要捲動 */
export type MessagesChange =
  | { kind: 'reset' }
  | { kind: 'append'; mine: boolean }
  | { kind: 'prepend' }
  | { kind: 'update'; id: string }
  | { kind: 'remove'; id: string }
  | { kind: 'sync' };

export interface StoreEvents {
  messages: MessagesChange;
  presence: PresenceUser[];
  status: ConnectionStatus;
  identity: Identity;
  older: { loading: boolean; hasMore: boolean };
  notice: string;
}

function byTime(a: Message, b: Message): number {
  return a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);
}

export class ChatStore {
  readonly events = new Emitter<StoreEvents>();
  readonly cooldown = new Cooldown();

  /** 由舊到新，不含已刪除 */
  messages: Message[] = [];
  presence: PresenceUser[] = [];
  status: ConnectionStatus = 'connecting';
  hasMoreOlder = true;
  loadingOlder = false;

  private sending = false;
  /** 收到的最新一筆變動時間，斷線重連時從這裡開始補 */
  private lastSyncAt = new Date(0).toISOString();

  constructor(
    private readonly transport: ChatTransport,
    public identity: Identity,
    private readonly identityStorage: Storage | null,
  ) {}

  get mode(): TransportMode {
    return this.transport.mode;
  }

  get canSend(): boolean {
    return this.status === 'online';
  }

  async start(): Promise<void> {
    this.transport.on('message:new', (m) => this.upsert(m, true));
    this.transport.on('message:updated', (m) => this.upsert(m, false));
    this.transport.on('message:deleted', ({ id }) => this.removeLocal(id));
    this.transport.on('presence:sync', (users) => {
      this.presence = users;
      this.events.emit('presence', users);
    });
    this.transport.on('connection:status', (status) => this.setStatus(status));
    this.transport.on('error', ({ message }) => this.events.emit('notice', message));

    const recent = await this.transport.loadRecent();
    this.messages = recent;
    this.hasMoreOlder = recent.length >= PAGE_SIZE;
    recent.forEach((m) => this.track(m));
    this.events.emit('messages', { kind: 'reset' });
    this.events.emit('older', { loading: false, hasMore: this.hasMoreOlder });

    await this.transport.connect(this.identity);
  }

  // ---------- 使用者動作 ----------

  /** 回傳 true 表示已送出，輸入框可以清空 */
  async send(raw: string): Promise<boolean> {
    if (!this.canSend) return this.fail('offline');
    const text = cleanContent(raw);
    const problem = validateContent(text);
    if (problem) return this.fail(problem);
    if (this.cooldown.active || this.sending) return this.fail('rate_limited');

    this.sending = true;
    try {
      const message = await this.transport.send(text, this.identity.nickname);
      // 送出成功後才開始算冷卻，和伺服器端的計時起點一致
      this.cooldown.mark();
      this.upsert(message, true);
      return true;
    } catch (error) {
      return this.fail(error);
    } finally {
      this.sending = false;
    }
  }

  async edit(id: string, raw: string): Promise<boolean> {
    if (!this.canSend) return this.fail('offline');
    const text = cleanContent(raw);
    const problem = validateContent(text);
    if (problem) return this.fail(problem);
    try {
      this.upsert(await this.transport.edit(id, text), false);
      return true;
    } catch (error) {
      return this.fail(error);
    }
  }

  async remove(id: string): Promise<boolean> {
    if (!this.canSend) return this.fail('offline');
    try {
      await this.transport.remove(id);
      this.removeLocal(id);
      return true;
    } catch (error) {
      return this.fail(error);
    }
  }

  /** 回傳錯誤文字；成功時回傳 null */
  async setNickname(raw: string): Promise<string | null> {
    const nickname = cleanNickname(raw);
    const problem = nicknameError(nickname);
    if (problem) return problem;
    this.identity = { ...this.identity, nickname };
    saveNickname(this.identityStorage, nickname);
    this.events.emit('identity', this.identity);
    await this.transport.updatePresence(nickname);
    return null;
  }

  async loadOlder(): Promise<void> {
    if (this.loadingOlder || !this.hasMoreOlder || this.messages.length === 0) return;
    this.loadingOlder = true;
    this.events.emit('older', { loading: true, hasMore: true });
    try {
      const oldest = this.messages[0];
      const older = await this.transport.loadBefore({ createdAt: oldest.createdAt, id: oldest.id });
      const known = new Set(this.messages.map((m) => m.id));
      const fresh = older.filter((m) => !known.has(m.id));
      fresh.forEach((m) => this.track(m));
      this.messages = [...fresh, ...this.messages].sort(byTime);
      this.hasMoreOlder = older.length >= PAGE_SIZE;
      if (fresh.length) this.events.emit('messages', { kind: 'prepend' });
    } catch (error) {
      this.fail(error);
    } finally {
      this.loadingOlder = false;
      this.events.emit('older', { loading: false, hasMore: this.hasMoreOlder });
    }
  }

  isMine(message: Message): boolean {
    return message.userId === this.identity.userId;
  }

  // ---------- 內部 ----------

  private setStatus(status: ConnectionStatus): void {
    const wasOnline = this.status === 'online';
    this.status = status;
    this.events.emit('status', status);
    // 每次連上線都補一次：重連時補斷線期間的變動，第一次連線時補「載入訊息」到「開始接收」之間的空檔
    if (!wasOnline && status === 'online') void this.catchUp();
  }

  /** 斷線重連後補上漏掉的新訊息、編輯、刪除（docs/architecture.md 第 6.7 節） */
  private async catchUp(): Promise<void> {
    try {
      const changed = await this.transport.loadChangedSince(this.lastSyncAt);
      const oldest = this.messages[0]?.createdAt ?? '';
      for (const m of changed) {
        if (m.deletedAt) this.removeLocal(m.id);
        // 比目前載入範圍更舊的訊息被編輯了，不用插進列表
        else this.upsert(m, m.createdAt >= oldest);
      }
    } catch (error) {
      this.fail(error);
    }
  }

  private upsert(message: Message, isNew: boolean): void {
    this.track(message);
    if (message.deletedAt) {
      this.removeLocal(message.id);
      return;
    }
    const index = this.messages.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      if (this.messages[index].updatedAt > message.updatedAt) return;
      this.messages[index] = message;
      this.events.emit('messages', { kind: 'update', id: message.id });
      return;
    }
    if (!isNew) return; // 編輯了一則我們還沒載入的舊訊息，不用理它
    const last = this.messages[this.messages.length - 1];
    this.messages.push(message);
    if (last && byTime(last, message) > 0) {
      this.messages.sort(byTime);
      this.events.emit('messages', { kind: 'sync' });
    } else {
      this.events.emit('messages', { kind: 'append', mine: this.isMine(message) });
    }
  }

  private removeLocal(id: string): void {
    const index = this.messages.findIndex((m) => m.id === id);
    if (index === -1) return;
    this.messages.splice(index, 1);
    this.events.emit('messages', { kind: 'remove', id });
  }

  private track(message: Message): void {
    if (message.updatedAt > this.lastSyncAt) this.lastSyncAt = message.updatedAt;
  }

  private fail(error: unknown): false {
    const code: ErrorCode =
      typeof error === 'string' ? (error as ErrorCode) : error instanceof ChatError ? error.code : 'unknown';
    if (!(error instanceof ChatError) && typeof error !== 'string') console.error(error);
    this.events.emit('notice', ERROR_MESSAGES[code]);
    return false;
  }
}
