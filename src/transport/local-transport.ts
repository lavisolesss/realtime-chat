// 階段一：localStorage + BroadcastChannel（docs/architecture.md 第 4.1 節）。
// 訊息存在這個瀏覽器的 localStorage，同一個瀏覽器的分頁之間用 BroadcastChannel 互相傳話。
// 身分存在 sessionStorage（每個分頁各自一份），這樣開兩個分頁才會像兩個人。
// 這裡也模擬伺服器端的檢查（字數、1 秒限制、只能改自己的訊息），讓階段一就能測到錯誤處理。

import {
  ChatError,
  COOLDOWN_MS,
  PAGE_SIZE,
  type Identity,
  type Message,
  type MessageCursor,
  type PresenceUser,
  type TransportEvents,
} from '../types';
import { cleanContent, validateContent } from '../lib/validate';
import { tagFromUserId } from '../lib/identity';
import { Emitter, type ChatTransport } from './transport';

const MESSAGES_KEY = 'realtime-chat:messages';
const USER_ID_KEY = 'realtime-chat:demo-user-id';
const CHANNEL_NAME = 'realtime-chat';
const HEARTBEAT_MS = 3000;
const PEER_TIMEOUT_MS = 8000;

type BusMessage =
  | { type: 'message:new' | 'message:updated'; message: Message }
  | { type: 'message:deleted'; id: string }
  | { type: 'presence:announce'; tabId: string; user: PresenceUser; wantsReply: boolean }
  | { type: 'presence:leave'; tabId: string };

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function byTime(a: Message, b: Message): number {
  return a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt);
}

function isBefore(m: Message, cursor: MessageCursor): boolean {
  return m.createdAt < cursor.createdAt || (m.createdAt === cursor.createdAt && m.id < cursor.id);
}

export class LocalTransport implements ChatTransport {
  readonly mode = 'demo' as const;

  private events = new Emitter<TransportEvents>();
  private channel: BroadcastChannel | null = null;
  private readonly tabId = uuid();
  private me: PresenceUser | null = null;
  private peers = new Map<string, { user: PresenceUser; lastSeen: number }>();
  private heartbeat: number | undefined;
  private lastSentAt = 0;
  private readonly onPageHide = () => this.post({ type: 'presence:leave', tabId: this.tabId });

  on<K extends keyof TransportEvents>(event: K, handler: (payload: TransportEvents[K]) => void): () => void {
    return this.events.on(event, handler);
  }

  async signIn(): Promise<string> {
    try {
      const saved = sessionStorage.getItem(USER_ID_KEY);
      if (saved) return saved;
      const id = uuid();
      sessionStorage.setItem(USER_ID_KEY, id);
      return id;
    } catch {
      return uuid();
    }
  }

  async connect(identity: Identity): Promise<void> {
    this.events.emit('connection:status', 'connecting');
    this.me = { userId: identity.userId, nickname: identity.nickname, tag: identity.tag, onlineAt: new Date().toISOString() };

    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<BusMessage>) => this.handleBus(event.data);
    }
    this.announce(true);
    this.heartbeat = window.setInterval(() => {
      this.announce(false);
      this.prunePeers();
    }, HEARTBEAT_MS);
    window.addEventListener('pagehide', this.onPageHide);

    this.emitPresence();
    this.events.emit('connection:status', 'online');
  }

  disconnect(): void {
    this.onPageHide();
    window.removeEventListener('pagehide', this.onPageHide);
    window.clearInterval(this.heartbeat);
    this.channel?.close();
    this.channel = null;
  }

  async loadRecent(): Promise<Message[]> {
    return this.visible().slice(-PAGE_SIZE);
  }

  async loadBefore(cursor: MessageCursor): Promise<Message[]> {
    return this.visible().filter((m) => isBefore(m, cursor)).slice(-PAGE_SIZE);
  }

  async loadChangedSince(since: string): Promise<Message[]> {
    return this.readAll().filter((m) => m.updatedAt > since).sort(byTime);
  }

  async send(content: string, nickname: string): Promise<Message> {
    const me = this.requireMe();
    const text = cleanContent(content);
    const problem = validateContent(text);
    if (problem) throw new ChatError(problem);
    if (Date.now() - this.lastSentAt < COOLDOWN_MS) throw new ChatError('rate_limited');

    const now = new Date().toISOString();
    const message: Message = {
      id: uuid(),
      userId: me.userId,
      nickname,
      tag: tagFromUserId(me.userId),
      content: text,
      createdAt: now,
      editedAt: null,
      deletedAt: null,
      updatedAt: now,
    };
    this.writeAll([...this.readAll(), message]);
    this.lastSentAt = Date.now();
    this.publish({ type: 'message:new', message });
    return message;
  }

  async edit(id: string, content: string): Promise<Message> {
    const text = cleanContent(content);
    const problem = validateContent(text);
    if (problem) throw new ChatError(problem);

    const now = new Date().toISOString();
    const updated = this.updateOwn(id, (m) => ({ ...m, content: text, editedAt: now, updatedAt: now }));
    this.publish({ type: 'message:updated', message: updated });
    return updated;
  }

  async remove(id: string): Promise<void> {
    const now = new Date().toISOString();
    // 和階段二一樣：清空內容並記錄刪除時間，而不是整筆刪掉
    this.updateOwn(id, (m) => ({ ...m, content: '', deletedAt: now, updatedAt: now }));
    this.publish({ type: 'message:deleted', id });
  }

  async updatePresence(nickname: string): Promise<void> {
    if (!this.me) return;
    this.me = { ...this.me, nickname };
    this.announce(false);
    this.emitPresence();
  }

  // ---------- 內部 ----------

  private requireMe(): PresenceUser {
    if (!this.me) throw new ChatError('offline');
    return this.me;
  }

  private updateOwn(id: string, change: (m: Message) => Message): Message {
    const me = this.requireMe();
    const all = this.readAll();
    const index = all.findIndex((m) => m.id === id);
    if (index === -1 || all[index].deletedAt) throw new ChatError('unknown');
    if (all[index].userId !== me.userId) throw new ChatError('not_owner');
    all[index] = change(all[index]);
    this.writeAll(all);
    return all[index];
  }

  private visible(): Message[] {
    return this.readAll().filter((m) => !m.deletedAt).sort(byTime);
  }

  private readAll(): Message[] {
    try {
      const raw = localStorage.getItem(MESSAGES_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as Message[]) : [];
    } catch {
      return [];
    }
  }

  private writeAll(messages: Message[]): void {
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      throw new ChatError('unknown');
    }
  }

  /** 通知自己這個分頁，也通知其他分頁 */
  private publish(message: BusMessage): void {
    this.handleBus(message);
    this.post(message);
  }

  private post(message: BusMessage): void {
    this.channel?.postMessage(message);
  }

  private announce(wantsReply: boolean): void {
    if (this.me) this.post({ type: 'presence:announce', tabId: this.tabId, user: this.me, wantsReply });
  }

  private handleBus(message: BusMessage): void {
    switch (message.type) {
      case 'message:new':
      case 'message:updated':
        this.events.emit(message.type, message.message);
        break;
      case 'message:deleted':
        this.events.emit('message:deleted', { id: message.id });
        break;
      case 'presence:announce':
        this.peers.set(message.tabId, { user: message.user, lastSeen: Date.now() });
        if (message.wantsReply) this.announce(false);
        this.emitPresence();
        break;
      case 'presence:leave':
        if (this.peers.delete(message.tabId)) this.emitPresence();
        break;
    }
  }

  private prunePeers(): void {
    const cutoff = Date.now() - PEER_TIMEOUT_MS;
    let changed = false;
    for (const [tabId, peer] of this.peers) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(tabId);
        changed = true;
      }
    }
    if (changed) this.emitPresence();
  }

  /** 同一個人開多個分頁只算一人（用 userId 合併），保留最早的上線時間 */
  private emitPresence(): void {
    const byUser = new Map<string, PresenceUser>();
    const all = [...(this.me ? [this.me] : []), ...[...this.peers.values()].map((p) => p.user)];
    for (const user of all) {
      const existing = byUser.get(user.userId);
      if (!existing || user.onlineAt < existing.onlineAt) {
        byUser.set(user.userId, existing ? { ...user, onlineAt: user.onlineAt } : user);
      }
    }
    if (this.me) byUser.set(this.me.userId, { ...this.me, onlineAt: byUser.get(this.me.userId)?.onlineAt ?? this.me.onlineAt });
    this.events.emit('presence:sync', [...byUser.values()]);
  }
}
