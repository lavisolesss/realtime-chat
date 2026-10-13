import { defineConfig } from 'vite';

// GitHub Pages 網址是 https://lavisolesss.github.io/realtime-chat/，
// 不是網域根目錄，所以 base 要設成 repo 名稱（見 docs/architecture.md 第 12 節）。
export default defineConfig({
  base: '/realtime-chat/',
});
