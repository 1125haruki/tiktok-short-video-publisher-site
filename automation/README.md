# TikTok Automation

初回だけ browser で TikTok を接続し、その後は local script で投稿を回すための最小構成です。

## 前提

- production app は `video.publish` 承認済み
- production worker は `user.info.basic,video.upload,video.publish` を使う
- browser では production workspace を使う

## 初回セットアップ

1. production workspace を開く
   - `https://1125haruki.github.io/tiktok-short-video-publisher-site/workspace.html?automation=1`
2. `Connect TikTok`
3. `Refresh Creator Session`
4. `Download Automation Bundle`
5. ダウンロードした JSON を `save_tiktok_session.py` で保存

```bash
python3 automation/save_tiktok_session.py \
  --session-file ~/Downloads/tiktok_creator_session_production.json
```

## 投稿

```bash
export TIKTOK_CLIENT_KEY='...'
export TIKTOK_CLIENT_SECRET='...'

python3 automation/publish_tiktok_job.py \
  --job-file /Users/takasuharuki/dev26/ショート動画/state/publish_jobs/publish_gen_zatsugaku_20260316_001.json \
  --check-status
```

## 既定動作

- `video.publish` scope があれば Direct Post
- なければ Upload API fallback
- `tiktok` ブロックが job に無い場合は、次を補完
  - `title`: `job.title`
  - `publicVideoUrl`: `job.tiktok.publicVideoUrl` または `job.instagram.publicVideoUrl`
  - `privacyLevel`: `PUBLIC_TO_EVERYONE`
  - `allowComment`: `true`
  - `allowDuet`: `false`
  - `allowStitch`: `false`
  - `isAigc`: `true`
  - branded content 系: `false`

## 推奨 job 例

```json
{
  "tiktok": {
    "enabled": true,
    "mode": "direct_post",
    "title": "俺は保冷剤、冷やすだけで終わるな",
    "publicVideoUrl": "https://1125haruki.github.io/tiktok-short-video-publisher-site/assets/gen_zatsugaku_20260316_001.mp4",
    "privacyLevel": "PUBLIC_TO_EVERYONE",
    "allowComment": true,
    "allowDuet": false,
    "allowStitch": false,
    "isAigc": true,
    "brandOrganicToggle": false,
    "brandContentToggle": false
  }
}
```

## 注意

- bundle JSON には refresh token が入るので厳重に扱う
- token が revoke されたら browser で再接続が必要
- 緊急時は `archive/approved_production_20260317/` の snapshot へ戻せる
