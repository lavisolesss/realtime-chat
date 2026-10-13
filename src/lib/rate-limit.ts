// 1 秒冷卻（docs/architecture.md 需求共識第 6 項）。前端只擋一般使用者，真正的防線在伺服器端。

import { COOLDOWN_MS } from '../types';

export class Cooldown {
  private lastAt = 0;

  constructor(private readonly ms = COOLDOWN_MS) {}

  get active(): boolean {
    return this.remaining() > 0;
  }

  remaining(): number {
    return Math.max(0, this.lastAt + this.ms - Date.now());
  }

  mark(): void {
    this.lastAt = Date.now();
  }
}
