# CLAUDE.md

這是一個用 Supabase 做即時傳訊、部署在 GitHub Pages 的匿名即時聊天室。

## 工作規則

- 開始任何工作前，先讀 `docs/architecture.md`（需求原文在 `docs/requirements.md`）。
- 目前在**階段一**：還沒接 Supabase，只做 `LocalTransport`（localStorage + BroadcastChannel）與示範模式。不要寫 Supabase 相關程式，除非使用者明確說要進入階段二。
- **不可以把金鑰檔案 commit 進 git**：`.env`、`.env.local` 或任何 `.env.*`（`.env.example` 除外，且裡面只能放空值）。commit 前先跑 `git status` 確認。
- 絕對不要在任何檔案裡寫入 Supabase 的 secret key（`sb_secret_…` 或 `service_role`）。
