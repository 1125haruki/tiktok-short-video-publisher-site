# Approved Production Snapshot

2026-03-17 時点の承認済み production 構成の退避です。

- snapshot commit:
  - `69fdaed626619818dec4fd07dd787cfa95f2009d`
- 含めるファイル:
  - `workspace.html`
  - `cloudflare-worker/src/index.js`
  - `cloudflare-worker/wrangler.toml`

復旧時は、この退避ファイルを本体へ戻すか、上の commit へ checkout してください。

この snapshot は「TikTok 審査を通した公開導線」を守るために残しています。自動投稿側の変更は別導線として追加し、緊急時にはここへ戻せる前提で進めます。
