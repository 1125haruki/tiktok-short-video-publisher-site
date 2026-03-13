# TikTok Short Video Publisher Site

TikTok Developers 申請用の最小公開セットです。

## 構成

- ルート
  - GitHub Pages で公開する静的ページ
- `cloudflare-worker/`
  - TikTok OAuth v2 の callback を受ける最小 Worker

## GitHub Pages 側で公開するファイル

- `index.html`
- `review.html`
- `demo.html`
- `privacy-policy.html`
- `terms-of-service.html`
- `callback.html`

`index.html` は外向けの完成した product website として使います。
`review.html` は TikTok 審査向けの mockup walkthrough と動画案内ページです。
`demo.html` は TikTok Login Kit と upload draft を実行する live app console です。

## TikTok Developers に登録する URL

- `Web URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/`
- `Review Walkthrough`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/review.html`
- `Live App Console`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/demo.html`
- `Privacy Policy URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/privacy-policy.html`
- `Terms of Service URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/terms-of-service.html`
- `Redirect URI`
  - `https://tiktok-short-video-publisher-auth.chillsabo1125.workers.dev/tiktok/callback`
- `Health Check`
  - `https://tiktok-short-video-publisher-auth.chillsabo1125.workers.dev/tiktok/health`

## 置換が必要な箇所

- `support@example.com`
- `YOUR NAME OR COMPANY`
- `https://example.com`
- Worker 側の `ALLOWED_ORIGIN`
- Worker 側の `TOKEN_SINK_URL` か保存先
- Worker 側の `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` / `STATE_SECRET`

## 実務メモ

- GitHub Pages は無料
- Cloudflare Workers も小規模なら無料枠で始めやすい
- `Redirect URI` は静的ページではなく server-side endpoint が必要
- `Website URL` は login page ではなく public website にする
- live な TikTok 認可導線は `demo.html` のような separate app page に分ける
- end-to-end の説明は `review.html` と review video で補強する
