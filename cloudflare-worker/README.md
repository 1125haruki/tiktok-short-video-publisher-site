# TikTok OAuth Worker

TikTok OAuth v2 の最小 Worker です。

## 役割

- `/tiktok/health`
  - デプロイ確認
  - secrets 未設定でも疎通確認できる
- `/tiktok/connect`
  - TikTok 認可画面へリダイレクト
- `/tiktok/callback`
  - `code` と `state` を受ける
  - server-side で token 交換
  - 必要なら token を外部 sink に転送
- `/tiktok/session`
  - 現在の creator session を返す
- `/tiktok/creator-info`
  - `video.publish` がある時だけ creator posting settings を返す
- `/tiktok/direct-post`
  - `video.publish` がある時だけ Direct Post を初期化する
- `/tiktok/upload-draft`
  - Upload API fallback を初期化する
- `/tiktok/status`
  - publish status を返す

## 必須環境変数

- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`
- `TIKTOK_SCOPE`
- `STATE_SECRET`
- `ALLOWED_ORIGIN`

## 任意環境変数

- `TOKEN_SINK_URL`
- `TOKEN_SINK_BEARER`

## TikTok 公式仕様の前提

- 認可開始 URL
  - `https://www.tiktok.com/v2/auth/authorize/`
- token 交換 URL
  - `https://open.tiktokapis.com/v2/oauth/token/`
- redirect URI は `https` の静的な絶対 URL で、query を含められません

## 運用メモ

- live の Upload API だけなら `TIKTOK_SCOPE=user.info.basic,video.upload`
- Direct Post 審査を進める時は `TIKTOK_SCOPE=user.info.basic,video.upload,video.publish`
- `TOKEN_SINK_URL` が未設定でも接続確認はできます
- 本番では token の保存先を必ず決めてください
- 現在の Worker URL は `https://tiktok-short-video-publisher-auth.chillsabo1125.workers.dev`
