#!/usr/bin/env python3
import argparse
import json
import sys
import urllib.parse
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone


PUBLIC_API = "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"
AUTH_API = "https://bsky.social/xrpc/app.bsky.feed.searchPosts"
SESSION_API = "https://bsky.social/xrpc/com.atproto.server.createSession"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch Bluesky public search posts")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--days", type=int, default=1, help="Recency window in days")
    parser.add_argument("--limit", type=int, default=25, help="Max posts to return")
    return parser.parse_args()


def parse_dt(raw: str) -> datetime | None:
    if not raw:
      return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None


def _build_query_params(query: str, limit: int) -> str:
    return urllib.parse.urlencode(
        {
            "q": query,
            "limit": str(max(1, min(limit, 100))),
            "sort": "latest",
        }
    )


def _request_posts(url: str, params: str, bearer: str | None = None) -> list[dict]:
    headers = {
        "accept": "application/json",
        "user-agent": "CroptoLast30DaysBluesky/1.0",
    }
    if bearer:
        headers["authorization"] = f"Bearer {bearer}"
    req = urllib.request.Request(f"{url}?{params}", headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    posts = payload.get("posts")
    return posts if isinstance(posts, list) else []


def _create_session() -> str | None:
    import os

    handle = str(os.getenv("BSKY_HANDLE") or "").strip().lstrip("@")
    password = str(os.getenv("BSKY_APP_PASSWORD") or "").strip()
    if not handle or not password:
        return None
    payload = json.dumps({"identifier": handle, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        SESSION_API,
        data=payload,
        headers={"content-type": "application/json", "user-agent": "CroptoLast30DaysBluesky/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    token = data.get("accessJwt")
    return str(token).strip() if token else None


def fetch_posts(query: str, limit: int) -> list[dict]:
    params = _build_query_params(query, limit)
    try:
        return _request_posts(PUBLIC_API, params)
    except urllib.error.HTTPError as exc:
        if exc.code != 403:
            raise
    # Public endpoint may return 403 in CI/cloud regions; retry authenticated API if creds are present.
    token = _create_session()
    if not token:
        raise RuntimeError("public_bluesky_403_and_no_valid_bsky_credentials")
    return _request_posts(AUTH_API, params, bearer=token)


def post_to_item(post: dict) -> dict | None:
    record = post.get("record") or {}
    author = post.get("author") or {}
    handle = str(author.get("handle") or "").strip()
    post_uri = str(post.get("uri") or "")
    text = str(record.get("text") or "").strip()
    created_at = str(record.get("createdAt") or post.get("indexedAt") or "").strip()
    if not text or not created_at or not handle or not post_uri:
        return None
    if post_uri.startswith("at://"):
        parts = post_uri.split("/")
        if len(parts) >= 5:
            post_id = parts[-1]
            url = f"https://bsky.app/profile/{handle}/post/{post_id}"
        else:
            url = ""
    else:
        url = ""
    return {
        "id": post.get("cid") or post_uri,
        "source": "bluesky",
        "title": text,
        "text": text,
        "url": url,
        "date": created_at,
        "author_handle": handle,
        "language": (post.get("langs") or [None])[0],
    }


def main() -> int:
    args = parse_args()
    try:
        posts = fetch_posts(args.query, args.limit)
    except Exception as exc:
        print(json.dumps({"error": f"public_bluesky_fetch_failed: {exc}"}))
        return 1

    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, args.days))
    out: list[dict] = []
    seen: set[str] = set()
    for post in posts:
        item = post_to_item(post)
        if not item:
            continue
        dt = parse_dt(str(item.get("date") or ""))
        if dt is None or dt < cutoff:
            continue
        key = str(item.get("url") or item.get("id") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
