// 身分、暱稱、隨機暱稱、辨識碼（docs/architecture.md 第 6.1、6.4 節）。

import type { Identity } from '../types';
import { cleanNickname, nicknameError } from './validate';

const ADJECTIVES = ['匿名', '安靜的', '夜貓子', '好奇的', '慵懶的', '勇敢的', '迷路的', '害羞的', '愛睡的', '路過的', '認真的', '神秘的'];
const ANIMALS = ['水獺', '刺蝟', '鸚鵡', '企鵝', '浣熊', '柴犬', '狐狸', '海豹', '貓頭鷹', '樹懶', '水豚', '石虎'];

const NICKNAME_KEY = 'realtime-chat:nickname';

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomNickname(): string {
  return pick(ADJECTIVES) + pick(ANIMALS);
}

/** 辨識碼：身分編號去掉「-」後的前 4 碼。同一個身分永遠一樣 */
export function tagFromUserId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 4).toLowerCase();
}

/** 辨識碼對應的顏色色相（0～359），讓同一個人永遠同一色 */
export function tagHue(tag: string): number {
  return (parseInt(tag, 16) || 0) % 360;
}

/** 讀取上次用過的暱稱，預填在進入畫面；沒有或不合規定就回傳空字串 */
export function loadSavedNickname(storage: Storage | null): string {
  try {
    const nickname = cleanNickname(storage?.getItem(NICKNAME_KEY) ?? '');
    return nicknameError(nickname) ? '' : nickname;
  } catch {
    // 瀏覽器不允許存取儲存空間時，就當作沒有存過
    return '';
  }
}

export function createIdentity(userId: string, nickname: string): Identity {
  return { userId, nickname, tag: tagFromUserId(userId) };
}

export function saveNickname(storage: Storage | null, nickname: string): void {
  try {
    storage?.setItem(NICKNAME_KEY, nickname);
  } catch {
    // 存不進去也不影響這次使用
  }
}
