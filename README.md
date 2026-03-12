# TikTok Short Video Publisher Site

TikTok Developers 申請用の最小公開セットです。

## 構成

- ルート
  - GitHub Pages で公開する静的ページ
- `cloudflare-worker/`
  - TikTok OAuth v2 の callback を受ける最小 Worker

## GitHub Pages 側で公開するファイル

- `index.html`
- `privacy-policy.html`
- `terms-of-service.html`
- `callback.html`

## TikTok Developers に登録する URL

- `Web URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/`
- `Privacy Policy URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/privacy-policy.html`
- `Terms of Service URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/terms-of-service.html`
- `Redirect URI`
  - `https://<your-worker-subdomain>.workers.dev/tiktok/callback`

## 置換が必要な箇所

- `support@example.com`
- `YOUR NAME OR COMPANY`
- `https://example.com`
- Worker 側の `ALLOWED_ORIGIN`
- Worker 側の `TOKEN_SINK_URL` か保存先

## 実務メモ

- GitHub Pages は無料
- Cloudflare Workers も小規模なら無料枠で始めやすい
- `Redirect URI` は静的ページではなく server-side endpoint が必要
