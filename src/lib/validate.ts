// 字數、空白、隱藏字元檢查（docs/architecture.md 第 9.1 節）。

import { MAX_CONTENT_LENGTH, MAX_NICKNAME_LENGTH, type ErrorCode } from '../types';

// 方向控制字元（可以把文字反過來顯示）與零寬字元
const HIDDEN_CHARS = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/**
 * 顯示前移除隱藏字元。別人可能繞過網頁直接呼叫 Supabase，
 * 所以從伺服器收到的訊息和暱稱，顯示前都要再清一次（docs/architecture.md 第 9.1 節）。
 */
export function stripHiddenChars(text: string): string {
  return text.replace(HIDDEN_CHARS, '');
}

/** 用「字元」計算長度，emoji 算 1 個字 */
export function charLength(text: string): number {
  return [...text].length;
}

/** 移除隱藏字元、統一換行、連續換行最多保留 2 個、去掉前後空白 */
export function cleanContent(text: string): string {
  return text
    .replace(HIDDEN_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 暱稱只能一行：移除隱藏字元、換行變空白、去掉前後空白 */
export function cleanNickname(text: string): string {
  return text.replace(HIDDEN_CHARS, '').replace(/\s+/g, ' ').trim();
}

export function validateContent(cleaned: string): ErrorCode | null {
  if (cleaned.length === 0) return 'empty';
  if (charLength(cleaned) > MAX_CONTENT_LENGTH) return 'too_long';
  return null;
}

export function nicknameError(cleaned: string): string | null {
  if (cleaned.length === 0) return '暱稱不能是空的';
  if (charLength(cleaned) > MAX_NICKNAME_LENGTH) return `暱稱最多 ${MAX_NICKNAME_LENGTH} 個字`;
  return null;
}
