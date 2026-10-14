// 通訊約定（docs/architecture.md 第 5 節）。階段一、階段二都遵守同一份約定。

export const PAGE_SIZE = 50;
export const MAX_CONTENT_LENGTH = 500;
export const MAX_NICKNAME_LENGTH = 20;
export const COOLDOWN_MS = 1000;
/** 伺服器保存訊息的期限與則數，要跟 supabase/migrations/002_retention.sql 一致 */
export const RETENTION_DAYS = 30;
export const RETENTION_MAX_MESSAGES = 5000;

/** 告訴使用者訊息會被保存多久（docs/architecture.md 第 9.4 節）。示範模式訊息只存在瀏覽器，不用顯示 */
export const RETENTION_NOTICE = `訊息會公開保存在伺服器上 ${RETENTION_DAYS} 天（最多最新 ${RETENTION_MAX_MESSAGES.toLocaleString('en-US')} 則），之後自動刪除。請勿張貼個人資料。`;

export interface Message {
  id: string;
  userId: string;
  /** 送出當時的暱稱 */
  nickname: string;
  /** 4 碼辨識碼，由 userId 推算 */
  tag: string;
  /** 已刪除時為空字串 */
  content: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  /** 最後一次變動（新增、編輯、刪除）的時間，斷線補資料用 */
  updatedAt: string;
}

export interface PresenceUser {
  userId: string;
  nickname: string;
  tag: string;
  onlineAt: string;
}

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting';

export interface Identity {
  userId: string;
  nickname: string;
  tag: string;
}

/** 載入更早訊息時的游標：目前最舊那則的時間與編號 */
export interface MessageCursor {
  createdAt: string;
  id: string;
}

export type ErrorCode = 'rate_limited' | 'too_long' | 'empty' | 'not_owner' | 'offline' | 'unknown';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  rate_limited: '送太快了，請稍等',
  too_long: `訊息不能超過 ${MAX_CONTENT_LENGTH} 字`,
  empty: '訊息不能是空的',
  not_owner: '只能修改自己的訊息',
  offline: '目前沒有連線，請稍後再試',
  unknown: '發生錯誤，請再試一次',
};

export class ChatError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ChatError';
  }
}

export interface TransportEvents {
  'message:new': Message;
  'message:updated': Message;
  'message:deleted': { id: string };
  'presence:sync': PresenceUser[];
  'connection:status': ConnectionStatus;
  error: { code: ErrorCode; message: string };
}
