#!/usr/bin/env python3

import argparse
import json
import os
from datetime import datetime
from pathlib import Path

import requests

DEFAULT_SESSION_FILE = Path("/Users/takasuharuki/dev26/ショート動画/state/auth_tokens/tiktok_creator_session.json")
DEFAULT_WORKER_BASE = "https://tiktok-short-video-publisher-auth.chillsabo1125.workers.dev"
DEFAULT_TIMEOUT = 30
TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"


def parse_args():
    parser = argparse.ArgumentParser(
        description="Create a TikTok Direct Post or Upload fallback request from a publish job."
    )
    parser.add_argument("--job-file", required=True, help="Path to publish_jobs/*.json")
    parser.add_argument(
        "--session-file",
        default=str(DEFAULT_SESSION_FILE),
        help="Validated TikTok creator session JSON produced by automation/save_tiktok_session.py",
    )
    parser.add_argument("--worker-base", default=DEFAULT_WORKER_BASE, help="TikTok auth worker base URL")
    parser.add_argument(
        "--client-key",
        default=os.environ.get("TIKTOK_CLIENT_KEY", ""),
        help="TikTok client key used for refresh_token exchange",
    )
    parser.add_argument(
        "--client-secret",
        default=os.environ.get("TIKTOK_CLIENT_SECRET", ""),
        help="TikTok client secret used for refresh_token exchange",
    )
    parser.add_argument(
        "--mode",
        default="auto",
        choices=("auto", "direct_post", "upload_fallback"),
        help="auto uses Direct Post when video.publish is available, otherwise Upload fallback",
    )
    parser.add_argument(
        "--check-status",
        action="store_true",
        help="Immediately call /tiktok/status after creating a publish ID",
    )
    return parser.parse_args()


def load_job(job_file):
    path = Path(job_file)
    if not path.exists():
        raise FileNotFoundError(f"publish job not found: {path}")
    job = json.loads(path.read_text(encoding="utf-8"))
    result_path = path.parent.parent / "post_results" / f"{job['jobId']}__tiktok.json"
    return path, job, result_path


def resolve_video_url(job):
    tiktok = job.get("tiktok") or {}
    if tiktok.get("publicVideoUrl"):
        return str(tiktok["publicVideoUrl"]).strip(), "job.tiktok.publicVideoUrl"

    instagram = job.get("instagram") or {}
    if instagram.get("publicVideoUrl"):
        return str(instagram["publicVideoUrl"]).strip(), "job.instagram.publicVideoUrl"

    raise ValueError("No public video URL found. Set tiktok.publicVideoUrl or instagram.publicVideoUrl in the job.")


def resolve_tiktok_settings(job):
    tiktok = dict(job.get("tiktok") or {})
    return {
        "enabled": bool(tiktok.get("enabled", True)),
        "mode": str(tiktok.get("mode", "auto")).strip() or "auto",
        "title": str(tiktok.get("title") or tiktok.get("caption") or job.get("title") or "").strip(),
        "privacyLevel": str(tiktok.get("privacyLevel") or "PUBLIC_TO_EVERYONE").strip(),
        "allowComment": bool(tiktok.get("allowComment", True)),
        "allowDuet": bool(tiktok.get("allowDuet", False)),
        "allowStitch": bool(tiktok.get("allowStitch", False)),
        "isAigc": bool(tiktok.get("isAigc", True)),
        "brandOrganicToggle": bool(tiktok.get("brandOrganicToggle", False)),
        "brandContentToggle": bool(tiktok.get("brandContentToggle", False)),
        "internalNote": str(tiktok.get("internalNote") or job.get("description") or "").strip(),
    }


def load_session(session_file):
    path = Path(session_file)
    if not path.exists():
        raise FileNotFoundError(f"TikTok session file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    access_token = str(payload.get("accessToken", "")).strip()
    refresh_token = str(payload.get("refreshToken", "")).strip()
    if not access_token:
        raise ValueError(f"TikTok session file has no accessToken: {path}")
    if not refresh_token:
        raise ValueError(f"TikTok session file has no refreshToken: {path}")
    return path, payload


def request_json(method, url, headers, *, body=None):
    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        data=body,
        timeout=DEFAULT_TIMEOUT,
    )
    payload = response.json()
    if response.status_code >= 400 or payload.get("error"):
        raise RuntimeError(
            f"TikTok request failed: {method} {url} -> {response.status_code} "
            f"{json.dumps(payload, ensure_ascii=False)}"
        )
    return payload


def refresh_access_token(refresh_token, client_key, client_secret):
    response = requests.post(
        TOKEN_URL,
        data={
            "client_key": client_key,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        },
        timeout=DEFAULT_TIMEOUT,
    )
    payload = response.json()
    if response.status_code >= 400:
        raise RuntimeError(
            f"TikTok refresh_token exchange failed: {response.status_code} "
            f"{json.dumps(payload, ensure_ascii=False)}"
        )
    return payload


def compute_expiry_iso(expires_in):
    seconds = float(expires_in)
    return datetime.fromtimestamp(
        datetime.now().astimezone().timestamp() + seconds
    ).astimezone().isoformat(timespec="seconds")


def maybe_refresh_session(session_path, session, client_key, client_secret):
    if not client_key or not client_secret:
        return session, None

    payload = refresh_access_token(session["refreshToken"], client_key, client_secret)
    refreshed = dict(session)
    refreshed["accessToken"] = str(payload.get("access_token", "")).strip() or session["accessToken"]
    refreshed["refreshToken"] = str(payload.get("refresh_token", "")).strip() or session["refreshToken"]
    refreshed["scope"] = str(payload.get("scope", "")).strip() or str(session.get("scope", "")).strip()
    refreshed["openId"] = str(payload.get("open_id", "")).strip() or str(session.get("openId", "")).strip()
    refreshed["refreshedAt"] = datetime.now().astimezone().isoformat(timespec="seconds")

    if payload.get("expires_in"):
        refreshed["accessTokenExpiresAt"] = compute_expiry_iso(payload["expires_in"])
    if payload.get("refresh_expires_in"):
        refreshed["refreshTokenExpiresAt"] = compute_expiry_iso(payload["refresh_expires_in"])

    session_path.write_text(json.dumps(refreshed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(session_path, 0o600)
    return refreshed, {
        "refreshedAt": refreshed["refreshedAt"],
        "scope": refreshed.get("scope", ""),
        "openId": refreshed.get("openId", ""),
    }


def build_headers(session):
    return {
        "Content-Type": "application/json",
        "X-TikTok-Access-Token": session["accessToken"],
        "X-TikTok-Scope": session.get("scope", ""),
        "X-TikTok-Open-Id": session.get("openId", ""),
    }


def scope_list(scope_value):
    return [value.strip() for value in str(scope_value or "").split(",") if value.strip()]


def choose_mode(requested_mode, session_scope, settings):
    if requested_mode != "auto":
        return requested_mode
    if settings["mode"] != "auto":
        return settings["mode"]
    return "direct_post" if "video.publish" in scope_list(session_scope) else "upload_fallback"


def fetch_creator_info(worker_base, headers):
    return request_json("POST", f"{worker_base}/tiktok/creator-info", headers)


def validate_direct_post(settings, creator_payload):
    creator_data = creator_payload.get("data") or {}
    privacy_options = creator_data.get("privacy_level_options") or []
    if not settings["title"]:
        raise ValueError("TikTok title is required. Set tiktok.title or job.title.")
    if settings["privacyLevel"] not in privacy_options:
        raise ValueError(
            f"Requested privacyLevel {settings['privacyLevel']} is not allowed for this creator. "
            f"Allowed: {privacy_options}"
        )
    if settings["brandContentToggle"] and settings["privacyLevel"] == "SELF_ONLY":
        raise ValueError("Branded content cannot be sent with SELF_ONLY privacy.")


def create_publish_request(worker_base, headers, mode, video_url, settings):
    if mode == "direct_post":
        return request_json(
            "POST",
            f"{worker_base}/tiktok/direct-post",
            headers,
            body=json.dumps(
                {
                    "videoUrl": video_url,
                    "title": settings["title"],
                    "privacyLevel": settings["privacyLevel"],
                    "allowComment": settings["allowComment"],
                    "allowDuet": settings["allowDuet"],
                    "allowStitch": settings["allowStitch"],
                    "brandOrganicToggle": settings["brandOrganicToggle"],
                    "brandContentToggle": settings["brandContentToggle"],
                    "isAigc": settings["isAigc"],
                },
                ensure_ascii=False,
            ),
        )

    return request_json(
        "POST",
        f"{worker_base}/tiktok/upload-draft",
        headers,
        body=json.dumps({"videoUrl": video_url}, ensure_ascii=False),
    )


def write_result(
    result_path,
    job_path,
    job,
    worker_base,
    video_url,
    source_key,
    mode,
    settings,
    session,
    creator_payload,
    publish_payload,
    status_payload,
    refresh_payload,
):
    payload = {
        "jobId": job["jobId"],
        "videoId": job.get("videoId", ""),
        "platform": "tiktok",
        "publishedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "scheduledAt": job.get("scheduledAt", ""),
        "sourcePath": str(job_path),
        "sourceGeneratedVideoPath": job.get("sourceGeneratedVideoPath", ""),
        "resultLabel": "direct_post_created" if mode == "direct_post" else "upload_draft_created",
        "workerBase": worker_base,
        "publicVideoUrl": video_url,
        "videoUrlSource": source_key,
        "publishId": publish_payload.get("publishId", ""),
        "mode": publish_payload.get("mode", mode),
        "scope": session.get("scope", ""),
        "openId": session.get("openId", ""),
        "tiktokSettings": settings,
        "sessionRefresh": refresh_payload or {},
        "statusCheck": status_payload or {},
        "raw": {
            "creatorInfo": creator_payload or None,
            "sessionRefresh": refresh_payload or None,
            "publish": publish_payload,
            "status": status_payload or None,
        },
    }
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    args = parse_args()
    job_path, job, result_path = load_job(args.job_file)
    settings = resolve_tiktok_settings(job)
    if not settings["enabled"]:
        raise ValueError("This job has tiktok.enabled=false")

    video_url, source_key = resolve_video_url(job)
    session_path, session = load_session(args.session_file)
    session, refresh_payload = maybe_refresh_session(
        session_path=session_path,
        session=session,
        client_key=args.client_key.strip(),
        client_secret=args.client_secret.strip(),
    )

    worker_base = args.worker_base.rstrip("/")
    headers = build_headers(session)
    session_payload = request_json("GET", f"{worker_base}/tiktok/session", headers)
    mode = choose_mode(args.mode, session_payload.get("scope", ""), settings)

    creator_payload = {}
    if mode == "direct_post":
        creator_payload = fetch_creator_info(worker_base, headers)
        validate_direct_post(settings, creator_payload)

    publish_payload = create_publish_request(worker_base, headers, mode, video_url, settings)

    status_payload = {}
    publish_id = str(publish_payload.get("publishId", "")).strip()
    if args.check_status and publish_id:
        status_payload = request_json(
            "GET",
            f"{worker_base}/tiktok/status?publish_id={publish_id}",
            headers,
        )

    write_result(
        result_path=result_path,
        job_path=job_path,
        job=job,
        worker_base=worker_base,
        video_url=video_url,
        source_key=source_key,
        mode=mode,
        settings=settings,
        session=session,
        creator_payload=creator_payload,
        publish_payload=publish_payload,
        status_payload=status_payload,
        refresh_payload=refresh_payload,
    )

    print(
        json.dumps(
            {
                "resultPath": str(result_path),
                "mode": mode,
                "publishId": publish_payload.get("publishId", ""),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
