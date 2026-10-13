// ChatTransport 介面：畫面和狀態管理只認得這個「插頭形狀」（docs/architecture.md 第 4.3、5.3 節）。
// 階段一插 LocalTransport，階段二插 SupabaseTransport，畫面程式不用改。

import type { Identity, Message, MessageCursor, TransportEvents } from '../types';

export type TransportMode = 'demo' | 'live';

export interface ChatTransport {
  /** demo＝示範模式（階段一），live＝接上 Supabase（階段二） */
  readonly mode: TransportMode;

  /** 取得這個訪客的身分編號；階段一是隨機編號，階段二是 Supabase 匿名登入 */
  signIn(): Promise<string>;
  /** 開始連線、加入在線名單 */
  connect(identity: Identity): Promise<void>;
  /** 最近 PAGE_SIZE 則訊息（不含已刪除），由舊到新 */
  loadRecent(): Promise<Message[]>;
  /** 比 cursor 更早的 PAGE_SIZE 則訊息，由舊到新 */
  loadBefore(cursor: MessageCursor): Promise<Message[]>;
  /** since 之後新增、編輯、刪除過的訊息（包含已刪除），斷線補資料用 */
  loadChangedSince(since: string): Promise<Message[]>;
  send(content: string, nickname: string): Promise<Message>;
  edit(id: string, content: string): Promise<Message>;
  remove(id: string): Promise<void>;
  updatePresence(nickname: string): Promise<void>;
  disconnect(): void;

  /** 訂閱事件，回傳取消訂閱的函式 */
  on<K extends keyof TransportEvents>(event: K, handler: (payload: TransportEvents[K]) => void): () => void;
}

/** 給各個 Transport 共用的小型事件發送器 */
export class Emitter<Events extends object> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>();

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => set.delete(handler as (payload: never) => void);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers.get(event)?.forEach((handler) => (handler as (p: Events[K]) => void)(payload));
  }
}
