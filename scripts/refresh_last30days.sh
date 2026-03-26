#!/usr/bin/env bash
set -euo pipefail

# Refresh last30days JSON snapshots for multiple windows and keep latest.json in sync.
#
# Usage:
#   LAST30DAYS_TOPIC="wheat corn soybeans sunflower rapeseed black sea logistics" \
#   LAST30DAYS_SCRIPT_PATH="$HOME/.agents/skills/last30days/scripts/last30days.py" \
#   ./scripts/refresh_last30days.sh
#
# Optional env:
#   LAST30DAYS_OUTPUT_DIR    (default: artifacts/last30days)
#   LAST30DAYS_TOPIC         (default: grain/oilseeds desk topic)
#   LAST30DAYS_SCRIPT_PATH   (default: ~/.agents/skills/last30days/scripts/last30days.py)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${LAST30DAYS_OUTPUT_DIR:-$ROOT_DIR/artifacts/last30days}"
TOPIC="${LAST30DAYS_TOPIC:-grain and oilseeds market wheat corn soybeans sunflower rapeseed black sea export logistics}"
SCRIPT_PATH="${LAST30DAYS_SCRIPT_PATH:-$HOME/.agents/skills/last30days/scripts/last30days.py}"

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "ERROR: last30days script not found: $SCRIPT_PATH" >&2
  echo "Set LAST30DAYS_SCRIPT_PATH to your last30days.py location." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

run_window() {
  local days="$1"
  local label="$2"
  local output_file="$OUT_DIR/${label}.json"
  local tmp_file="$OUT_DIR/.${label}.tmp.json"

  echo "[last30days] Running ${label} (${days}d)..."
  python3 "$SCRIPT_PATH" "$TOPIC" --days="$days" --emit=json --store > "$tmp_file"
  mv "$tmp_file" "$output_file"
}

run_window 1 "yesterday"
run_window 7 "week"
run_window 30 "month"
run_window 365 "year"

cp "$OUT_DIR/month.json" "$OUT_DIR/latest.json"

echo "[last30days] Snapshot refresh complete."
echo "[last30days] Output dir: $OUT_DIR"
ls -1 "$OUT_DIR" | sed "s/^/  - /"
