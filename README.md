# realtime-chat

打開就能用的匿名即時聊天室。前端用 TypeScript + Vite（不用框架），部署在 GitHub Pages；階段二接上 Supabase。

- 網址：https://lavisolesss.github.io/realtime-chat/
- 架構文件：[docs/architecture.md](docs/architecture.md)
- 視覺設計：[docs/design.md](docs/design.md)

## 本機開發

需要 Node.js 20 以上。

```
npm install
npm run dev       # 開發用，改程式會自動更新畫面
npm run build     # 型別檢查＋打包到 dist/
npm run preview   # 預覽打包後的結果
```

開發網址是 `http://localhost:5173/realtime-chat/`（`npm run preview` 是 4173 port）。

## 目前進度：階段一（示範模式）

沒有設定 Supabase 時會自動進入示範模式：訊息存在這個瀏覽器裡，同一個瀏覽器開兩個分頁就能互相聊天。
