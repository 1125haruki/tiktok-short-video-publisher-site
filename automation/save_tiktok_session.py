#!/usr/bin/env python3

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

DEFAULT_OUTPUT = Path("/Users/takasuharuki/dev26/ショート動画/state/auth_tokens/tiktok_creator_session.json")
DEFAULT_WORKER_BASE = "https://tiktok-short-video-publisher-auth.chillsabo1125.workers.dev"
DEFAULT_TIMEOUT = 30


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Save a TikTok creator session bundle downloaded from workspace.html?automation=1 "
            "and validate it against the production worker."
        )
    )
    parser.add_argument("--session-json", default="", help="Raw JSON string downloaded from the workspace")
    parser.add_argument("--session-file", default="", help="Path to the downloaded JSON file")
    parser.add_argument("--worker-base", default=DEFAULT_WORKER_BASE, help="TikTok auth worker base URL")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Where to save the validated session bundle")
    return parser.parse_args()


def load_session_blob(args):
    if args.session_json.strip():
        return args.session_json.strip()

    if args.session_file:
        path = Path(args.session_file)
        if not path.exists():
            raise FileNotFoundError(f"session file not found: {path}")
        return path.read_text(encoding="utf-8").strip()

    raise ValueError("Provide --session-json or --session-file.")


def parse_session(blob):
    data = json.loads(blob)
    access_token = str(data.get("accessToken", "")).strip()
    refresh_token = str(data.get("refreshToken", "")).strip()
    if not access_token:
        raise ValueError("session JSON does not contain accessToken")
    if not refresh_token:
        raise ValueError("session JSON does not contain refreshToken")

    return {
        "accessToken": access_token,
        "refreshToken": refresh_token,
        "scope": str(data.get("scope", "")).strip(),
        "openId": str(data.get("openId", "")).strip(),
        "accessTokenExpiresAt": str(data.get("accessTokenExpiresAt", "")).strip(),
        "refreshTokenExpiresAt": str(data.get("refreshTokenExpiresAt", "")).strip(),
        "workerBase": str(data.get("workerBase", "")).strip(),
        "exportedAt": str(data.get("exportedAt", "")).strip(),
    }


def call_session(worker_base, session):
    response = requests.get(
        f"{worker_base.rstrip('/')}/tiktok/session",
        headers={
            "X-TikTok-Access-Token": session["accessToken"],
            "X-TikTok-Scope": session["scope"],
            "X-TikTok-Open-Id": session["openId"],
        },
        timeout=DEFAULT_TIMEOUT,
    )
    payload = response.json()
    if response.status_code >= 400 or not payload.get("connected"):
        raise RuntimeError(f"TikTok session validation failed: {json.dumps(payload, ensure_ascii=False)}")
    return payload


def redact(token):
    if len(token) <= 12:
        return "*" * len(token)
    return f"{token[:6]}...{token[-4:]}"


def main():
    args = parse_args()
    blob = load_session_blob(args)
    session = parse_session(blob)
    payload = call_session(args.worker_base, session)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output = {
        "savedAt": datetime.now(timezone.utc).isoformat(),
        "workerBase": args.worker_base.rstrip("/"),
        "accessToken": session["accessToken"],
        "refreshToken": session["refreshToken"],
        "scope": session["scope"],
        "openId": session["openId"],
        "accessTokenExpiresAt": session["accessTokenExpiresAt"],
        "refreshTokenExpiresAt": session["refreshTokenExpiresAt"],
        "exportedAt": session["exportedAt"],
        "validatedSession": payload,
    }
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(output_path, 0o600)

    print(
        json.dumps(
            {
                "output": str(output_path),
                "connected": payload.get("connected", False),
                "scope": session["scope"],
                "openId": session["openId"],
                "redactedAccessToken": redact(session["accessToken"]),
                "redactedRefreshToken": redact(session["refreshToken"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
