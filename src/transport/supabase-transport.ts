// 階段二：Supabase（docs/architecture.md 第 3.3、4.2、6.7 節）。
// Database 存訊息、Realtime Postgres Changes 即時同步、Realtime Presence 在線名單、匿名登入當身分。
// 真正的防線（字數、1 秒限制、只能改自己的訊息）在 supabase/migrations/001_init.sql。

import { createClient, type PostgrestError, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../config';
import {
  ChatError,
  PAGE_SIZE,
  type ConnectionStatus,
  type ErrorCode,
  type Identity,
  type Message,
  type MessageCursor,
  type PresenceUser,
  type TransportEvents,
} from '../types';
import { Emitter, type ChatTransport } from './transport';

interface MessageRow {
  id: string;
  user_id: string;
  nickname: string;
  tag: string;
  content: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  updated_at: string;
}

const TABLE = 'messages';
const COLUMNS = 'id,user_id,nickname,tag,content,created_at,edited_at,deleted_at,updated_at';
const CHANGED_SINCE_LIMIT = 500;
/** 重連太久沒成功時，重新建立頻道 */
const STUCK_RECONNECT_MS = 15000;

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    userId: row.user_id,
    nickname: row.nickname,
    tag: row.tag,
    content: row.content,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    updatedAt: row.updated_at,
  };
}

/** 把 Supabase 的錯誤翻成通訊約定的錯誤代碼 */
function toChatError(error: PostgrestError | Error | null, fallback: ErrorCode = 'unknown'): ChatError {
  if (!error) return new ChatError(fallback);
  const message = error.message ?? '';
  const code = 'code' in error ? error.code : '';
  if (message.includes('rate_limited')) return new ChatError('rate_limited');
  if (code === '42501') return new ChatError('not_owner');
  if (code === '23514') return new ChatError(message.includes('content') ? 'too_long' : 'unknown');
  if (error instanceof TypeError || message.includes('Failed to fetch')) return new ChatError('offline');
  return new ChatError(fallback);
}

interface PresenceMeta {
  userId: string;
  nickname: string;
  tag: string;
  onlineAt: string;
}

export class SupabaseTransport implements ChatTransport {
  readonly mode = 'live' as const;

  private events = new Emitter<TransportEvents>();
  private client: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private me: PresenceMeta | null = null;
  private status: ConnectionStatus = 'connecting';
  private stuckTimer: number | undefined;
  private closing = false;

  private readonly onOffline = () => this.setStatus('reconnecting');
  private readonly onOnline = () => {
    if (this.status !== 'online') this.watchStuck();
  };

  constructor(config: SupabaseConfig) {
    this.client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  on<K extends keyof TransportEvents>(event: K, handler: (payload: TransportEvents[K]) => void): () => void {
    return this.events.on(event, handler);
  }

  /** 已經有匿名身分就沿用（存在 localStorage），沒有就匿名登入 */
  async signIn(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: signedIn, error } = await this.client.auth.signInAnonymously();
    if (error || !signedIn.user) throw error ?? new Error('匿名登入失敗');
    return signedIn.user.id;
  }

  async connect(identity: Identity): Promise<void> {
    this.me = { userId: identity.userId, nickname: identity.nickname, tag: identity.tag, onlineAt: new Date().toISOString() };
    this.closing = false;
    window.addEventListener('offline', this.onOffline);
    window.addEventListener('online', this.onOnline);
    this.setStatus('connecting');
    // Presence 第一次同步前，名單裡至少有自己
    this.events.emit('presence:sync', [{ ...this.me }]);
    this.subscribe();
  }

  disconnect(): void {
    this.closing = true;
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('online', this.onOnline);
    window.clearTimeout(this.stuckTimer);
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  }

  async loadRecent(): Promise<Message[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select(COLUMNS)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) throw toChatError(error);
    return (data as MessageRow[]).map(toMessage).reverse();
  }

  async loadBefore(cursor: MessageCursor): Promise<Message[]> {
    const at = `"${cursor.createdAt}"`;
    const { data, error } = await this.client
      .from(TABLE)
      .select(COLUMNS)
      .is('deleted_at', null)
      .or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) throw toChatError(error);
    return (data as MessageRow[]).map(toMessage).reverse();
  }

  async loadChangedSince(since: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from(TABLE)
      .select(COLUMNS)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(CHANGED_SINCE_LIMIT);
    if (error) throw toChatError(error);
    return (data as MessageRow[]).map(toMessage);
  }

  async send(content: string, nickname: string): Promise<Message> {
    // 身分、辨識碼、時間都由資料庫填入，這裡只送內容和暱稱
    const { data, error } = await this.client.from(TABLE).insert({ content, nickname }).select(COLUMNS).single();
    if (error) throw toChatError(error);
    return toMessage(data as MessageRow);
  }

  async edit(id: string, content: string): Promise<Message> {
    const { data, error } = await this.client.from(TABLE).update({ content }).eq('id', id).select(COLUMNS);
    if (error) throw toChatError(error);
    // RLS 擋下時不會報錯，只是一筆都沒改到
    if (!data?.length) throw new ChatError('not_owner');
    return toMessage(data[0] as MessageRow);
  }

  async remove(id: string): Promise<void> {
    const { data, error } = await this.client
      .from(TABLE)
      .update({ content: '', deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    if (error) throw toChatError(error);
    if (!data?.length) throw new ChatError('not_owner');
  }

  async updatePresence(nickname: string): Promise<void> {
    if (!this.me) return;
    this.me = { ...this.me, nickname };
    if (this.status === 'online') await this.channel?.track(this.me);
  }

  // ---------- 內部 ----------

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.events.emit('connection:status', status);
    if (status === 'online') window.clearTimeout(this.stuckTimer);
    else this.watchStuck();
  }

  /** Supabase 會自己重連；太久沒連上就把頻道拆掉重建一次 */
  private watchStuck(): void {
    window.clearTimeout(this.stuckTimer);
    this.stuckTimer = window.setTimeout(() => {
      if (this.closing || this.status === 'online' || !navigator.onLine) return;
      this.subscribe();
    }, STUCK_RECONNECT_MS);
  }

  private subscribe(): void {
    if (!this.me) return;
    if (this.channel) void this.client.removeChannel(this.channel);

    const channel = this.client.channel('room:main', { config: { presence: { key: this.me.userId } } });
    this.channel = channel;

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) => {
        this.events.emit('message:new', toMessage(payload.new as MessageRow));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE }, (payload) => {
        const message = toMessage(payload.new as MessageRow);
        if (message.deletedAt) this.events.emit('message:deleted', { id: message.id });
        else this.events.emit('message:updated', message);
      })
      .on('presence', { event: 'sync' }, () => this.emitPresence(channel))
      .subscribe((state) => {
        if (channel !== this.channel || this.closing) return;
        if (state === 'SUBSCRIBED') {
          this.setStatus('online');
          if (this.me) void channel.track(this.me);
        } else {
          this.setStatus('reconnecting');
        }
      });
  }

  /** 同一個人開多個分頁只算一人（presence key 就是 userId） */
  private emitPresence(channel: RealtimeChannel): void {
    const state = channel.presenceState<PresenceMeta>();
    const users: PresenceUser[] = [];
    for (const metas of Object.values(state)) {
      if (!metas.length) continue;
      const earliest = metas.reduce((a, b) => (a.onlineAt <= b.onlineAt ? a : b));
      const latest = metas[metas.length - 1];
      users.push({ userId: latest.userId, nickname: latest.nickname, tag: latest.tag, onlineAt: earliest.onlineAt });
    }
    this.events.emit('presence:sync', users);
  }
}
