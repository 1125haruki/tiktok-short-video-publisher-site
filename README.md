# TikTok Short Video Publisher Site

TikTok Developers 申請用の最小公開セットです。

## 構成

- ルート
  - GitHub Pages で公開する静的ページ
- `cloudflare-worker/`
  - TikTok OAuth v2 の callback を受ける最小 Worker

## GitHub Pages 側で公開するファイル

- `index.html`
- `tour.html`
- `workspace.html`
- `help.html`
- `review.html`
- `demo.html`
- `privacy-policy.html`
- `terms-of-service.html`
- `callback.html`

`index.html` は外向けの完成した product website として使います。
`tour.html` は product walkthrough と workflow video の案内ページです。
`workspace.html` は TikTok Login Kit、creator info review、Direct Post 審査向け posting controls、Upload fallback をまとめた publisher workspace です。
`help.html` は workflow と support の公開ヘルプページです。
`review.html` と `demo.html` は古い URL からの redirect 用に残しています。

## TikTok Developers に登録する URL

- `Web URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/`
- `Product Tour`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/tour.html`
- `Publisher Workspace`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/workspace.html`
- `Sandbox Workspace`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/workspace.html?mode=sandbox`
- `Help Center`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/help.html`
- `Privacy Policy URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/privacy-policy.html`
- `Terms of Service URL`
  - `https://1125haruki.github.io/tiktok-short-video-publisher-site/terms-of-service.html`
- `Redirect URI`
  - `https://tiktok-short-video-publisher-auth.chillsabo1125.workers.dev/tiktok/callback`
- `Sandbox Redirect URI`
  - `https://tiktok-short-video-publisher-auth-sandbox.chillsabo1125.workers.dev/tiktok/callback`
- `Health Check`
  - `https://tiktok-short-video-publisher-auth.chillsabo1125.workers.dev/tiktok/health`
- `Sandbox Health Check`
  - `https://tiktok-short-video-publisher-auth-sandbox.chillsabo1125.workers.dev/tiktok/health`

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
- live な TikTok 認可導線は `workspace.html` のような separate app page に分ける
- workflow 動画と product walkthrough は `tour.html` にまとめる
- Direct Post 審査では `creator_info/query` を使って privacy / interaction / duration を creator に見せる
- Direct Post を有効化する時は Worker の scope を `user.info.basic,video.upload,video.publish` に広げる
- `PULL_FROM_URL` で使う動画URLは、自分が所有・検証できる domain か URL prefix に寄せる
- Sandbox で Direct Post を試す時は `workspace.html?mode=sandbox` を使う
- Cloudflare Worker の sandbox 環境は `npm run deploy:sandbox` で deploy する
