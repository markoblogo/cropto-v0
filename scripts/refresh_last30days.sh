#!/usr/bin/env bash
set -euo pipefail

# Refresh last30days JSON snapshots for multiple windows and keep latest.json in sync.
#
# Optional env:
#   LAST30DAYS_OUTPUT_DIR    (default: artifacts/last30days)
#   LAST30DAYS_SCRIPT_PATH   (default: ~/.agents/skills/last30days/scripts/last30days.py)
#   LAST30DAYS_TOPICS        (default: EN grain/oilseeds themes, separated by "||")
#   LAST30DAYS_TOPICS_UK     (default: UKR grain/oilseeds themes, separated by "||")
#   LAST30DAYS_SEARCH        (default: reddit,x,bluesky,hn,youtube,web)
#   LAST30DAYS_TIMEOUT       (default: 240)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${LAST30DAYS_OUTPUT_DIR:-$ROOT_DIR/artifacts/last30days}"
SCRIPT_PATH="${LAST30DAYS_SCRIPT_PATH:-$HOME/.agents/skills/last30days/scripts/last30days.py}"
TOPICS_RAW="${LAST30DAYS_TOPICS:-${LAST30DAYS_TOPIC:-grain market wheat corn soybeans sunflower rapeseed black sea export||ukraine grain export corridor black sea logistics||europe oilseeds crush biodiesel rapeseed sunflower imports}}"
TOPICS_UK_RAW="${LAST30DAYS_TOPICS_UK:-ціни на пшеницю чорноморський експорт||україна зерновий коридор дунай порти логістика||соняшникова олія ріпак соя європа ринок}"
SEARCH_SOURCES="${LAST30DAYS_SEARCH:-reddit,x,bluesky,hn,youtube,web}"
ORIGINAL_SEARCH_SOURCES="$SEARCH_SOURCES"
TIMEOUT_SECS="${LAST30DAYS_TIMEOUT:-240}"
BLUESKY_PUBLIC_FALLBACK=0

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "ERROR: last30days script not found: $SCRIPT_PATH" >&2
  echo "Set LAST30DAYS_SCRIPT_PATH to your last30days.py location." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

split_topics() {
  local raw="$1"
  mapfile -t TOPICS < <(printf "%s\n" "$raw" | sed 's/||/\n/g; s/^ *//; s/ *$//')
  local filtered=()
  local topic
  for topic in "${TOPICS[@]}"; do
    [[ -n "$topic" ]] && filtered+=("$topic")
  done
  TOPICS=("${filtered[@]}")
}

strip_source_from_search() {
  local source="$1"
  local csv="$2"
  local updated
  updated="$(printf "%s" "$csv" | sed -E "s/(^|,)$source(,|$)/,/g; s/,+/,/g; s/^,//; s/,$//")"
  printf "%s" "$updated"
}

check_bluesky_auth() {
  python3 - "$1" "$2" <<'PY'
import json
import sys
import urllib.request
import urllib.error

handle = sys.argv[1].strip()
password = sys.argv[2].strip()
if not handle or not password:
    raise SystemExit(1)

url = "https://bsky.social/xrpc/com.atproto.server.createSession"
payload = json.dumps({"identifier": handle, "password": password}).encode("utf-8")
req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
try:
    with urllib.request.urlopen(req, timeout=12) as resp:
        if 200 <= resp.status < 300:
            raise SystemExit(0)
except urllib.error.HTTPError:
    pass
except Exception:
    pass
raise SystemExit(1)
PY
}

configure_bluesky() {
  if [[ ",$ORIGINAL_SEARCH_SOURCES," != *",bluesky,"* ]]; then
    return
  fi

  local handle="${BSKY_HANDLE:-}"
  local password="${BSKY_APP_PASSWORD:-}"
  handle="$(printf "%s" "$handle" | sed 's/^@//; s/^ *//; s/ *$//')"
  export BSKY_HANDLE="$handle"

  if [[ -z "$handle" || -z "$password" ]]; then
    echo "[last30days] WARN: bluesky credentials are missing, switching to public Bluesky fallback for this run." >&2
    BLUESKY_PUBLIC_FALLBACK=1
    SEARCH_SOURCES="$(strip_source_from_search "bluesky" "$SEARCH_SOURCES")"
    return
  fi

  local attempt
  for attempt in 1 2; do
    if check_bluesky_auth "$handle" "$password"; then
      echo "[last30days] Bluesky auth preflight OK."
      return
    fi
    sleep 2
  done

  echo "[last30days] WARN: bluesky auth preflight failed (403/invalid creds), switching to public Bluesky fallback for this run." >&2
  BLUESKY_PUBLIC_FALLBACK=1
  SEARCH_SOURCES="$(strip_source_from_search "bluesky" "$SEARCH_SOURCES")"
}

run_bluesky_public_query() {
  local days="$1"
  local topic="$2"
  local out_file="$3"
  python3 "$ROOT_DIR/scripts/fetch_bluesky_public.py" "$topic" --days="$days" --limit=25 > "$out_file"
}

run_query() {
  local days="$1"
  local topic="$2"
  local out_file="$3"
  local err_file="$4"
  python3 "$SCRIPT_PATH" "$topic" \
    --days="$days" \
    --emit=json \
    --store \
    --include-web \
    --search "$SEARCH_SOURCES" \
    --timeout "$TIMEOUT_SECS" > "$out_file" 2> "$err_file"
}

write_empty_payload() {
  local output_file="$1"
  local window_label="$2"
  cat > "$output_file" <<EOF
{"generatedAt":"$(date -u +"%Y-%m-%dT%H:%M:%SZ")","window":"${window_label}","items":[]}
EOF
}

merge_payloads() {
  local output_file="$1"
  shift
  python3 - "$output_file" "$@" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

def norm_date(item):
    for key in ("published_at", "publishedAt", "date", "timestamp", "created_at"):
        value = item.get(key)
        if value:
            return str(value)
    return "1970-01-01T00:00:00Z"

def extract_items(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("items", "feed", "results", "records"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    data = payload.get("data")
    if isinstance(data, dict):
        for key in ("items", "feed", "results", "records"):
            value = data.get(key)
            if isinstance(value, list):
                return value
    # last30days report-style JSON keeps source arrays on top-level keys.
    source_keys = (
        "reddit",
        "x",
        "youtube",
        "hackernews",
        "bluesky",
        "truthsocial",
        "polymarket",
        "web",
        "instagram",
        "tiktok",
    )
    merged = []
    for source_key in source_keys:
        value = payload.get(source_key)
        if not isinstance(value, list):
            continue
        for row in value:
            if not isinstance(row, dict):
                continue
            mapped = dict(row)
            mapped.setdefault("source", source_key)
            mapped.setdefault("title", row.get("title") or row.get("text") or row.get("post") or source_key)
            mapped.setdefault("url", row.get("url") or row.get("link") or "")
            mapped.setdefault(
                "date",
                row.get("date")
                or row.get("created_at")
                or row.get("published_at")
                or row.get("timestamp")
                or "",
            )
            merged.append(mapped)
    if merged:
        return merged
    return []

out_file = sys.argv[1]
inputs = sys.argv[2:]
items = []
for path in inputs:
    if not os.path.isfile(path):
        continue
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        continue
    items.extend(extract_items(payload))

seen = set()
deduped = []
for item in items:
    if not isinstance(item, dict):
        continue
    key = (
        str(item.get("id", "")) or "",
        str(item.get("url", item.get("link", ""))) or "",
        str(item.get("title", item.get("headline", item.get("text", "")))) or "",
    )
    if key in seen:
        continue
    seen.add(key)
    deduped.append(item)

deduped.sort(key=norm_date, reverse=True)
result = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "items": deduped,
    "meta": {"inputFiles": len(inputs), "itemCount": len(deduped)},
}
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
PY
}

configure_bluesky

COMBINED_TOPICS_RAW="$TOPICS_RAW"
if [[ -n "${TOPICS_UK_RAW// }" ]]; then
  COMBINED_TOPICS_RAW="${COMBINED_TOPICS_RAW}||${TOPICS_UK_RAW}"
fi
split_topics "$COMBINED_TOPICS_RAW"

run_window() {
  local days="$1"
  local label="$2"
  local output_file="$OUT_DIR/${label}.json"
  local input_files=()
  local i=0

  echo "[last30days] Running ${label} (${days}d) across ${#TOPICS[@]} topics..."
  for topic in "${TOPICS[@]}"; do
    local tmp_file="$OUT_DIR/.${label}.topic${i}.json"
    local err_file="$OUT_DIR/.${label}.topic${i}.err.log"
    local bluesky_tmp="$OUT_DIR/.${label}.topic${i}.bluesky.json"
    set +e
    run_query "$days" "$topic" "$tmp_file" "$err_file"
    local rc=$?
    set -e
    if [[ $rc -eq 0 ]]; then
      if [[ ",$SEARCH_SOURCES," == *",bluesky," ]] && grep -Eq "Bluesky error: .*403|Bluesky search failed: HTTP 403" "$err_file"; then
        echo "[last30days] WARN: bluesky returned 403 during search, disabling bluesky for remaining topics in this run." >&2
        SEARCH_SOURCES="$(strip_source_from_search "bluesky" "$SEARCH_SOURCES")"
      fi
      input_files+=("$tmp_file")
      for raw_name in raw_reddit_threads_enriched.json raw_x_posts.json raw_youtube_videos.json raw_hn_stories.json raw_bluesky_posts.json; do
        local raw_src="$OUT_DIR/$raw_name"
        if [[ -f "$raw_src" ]]; then
          local raw_copy="$OUT_DIR/.${label}.topic${i}.${raw_name}"
          cp "$raw_src" "$raw_copy"
          input_files+=("$raw_copy")
        fi
      done
    else
      echo "[last30days] WARN: query failed for ${label} topic #$((i + 1))" >&2
      rm -f "$tmp_file"
    fi

    if [[ ",$ORIGINAL_SEARCH_SOURCES," == *",bluesky,"* ]]; then
      set +e
      run_bluesky_public_query "$days" "$topic" "$bluesky_tmp"
      local bluesky_rc=$?
      set -e
      if [[ $bluesky_rc -eq 0 && -s "$bluesky_tmp" ]]; then
        input_files+=("$bluesky_tmp")
      else
        rm -f "$bluesky_tmp"
      fi
    fi

    rm -f "$err_file"
    i=$((i + 1))
  done

  if [[ ${#input_files[@]} -eq 0 ]]; then
    echo "[last30days] WARN: no successful queries for ${label}, writing empty payload" >&2
    write_empty_payload "$output_file" "$label"
    return
  fi

  merge_payloads "$output_file" "${input_files[@]}"
  rm -f "${input_files[@]}"
}

run_window 1 "yesterday"
run_window 7 "week"
run_window 30 "month"

cp "$OUT_DIR/month.json" "$OUT_DIR/latest.json"

echo "[last30days] Snapshot refresh complete."
echo "[last30days] Output dir: $OUT_DIR"
ls -1 "$OUT_DIR" | sed "s/^/  - /"
