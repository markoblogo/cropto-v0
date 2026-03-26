#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path


OUT_DIR = Path(os.environ.get("LAST30DAYS_OUTPUT_DIR", "artifacts/last30days")).resolve()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
MODEL = os.environ.get("LAST30DAYS_AI_MODEL", "gpt-4.1-mini").strip()
MONITOR_CONTEXT_URL = os.environ.get(
    "LAST30DAYS_MONITOR_CONTEXT_URL",
    "https://cropto.abvx.xyz/api/market-dashboard?debugSources=1",
).strip()

WINDOWS = [
    ("yesterday", 1, "Yesterday"),
    ("week", 7, "Week"),
    ("month", 30, "30 Days"),
]


def read_json(path: Path):
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def infer_language(text: str) -> str:
    lower = (text or "").lower()
    if re.search(r"[іїєґ]", lower) or re.search(r"[а-яё]", lower):
        return "uk"
    return "en"


def infer_region(text: str, region_raw: str) -> str:
    region = (region_raw or "").strip().lower()
    if region:
        return region
    lower = (text or "").lower()
    if re.search(r"\bukraine\b|\bodesa\b|\bodessa\b|\bукра", lower):
        return "ukraine"
    if re.search(r"\bblack sea\b|\bчорномор", lower):
        return "black_sea"
    return "global"


def normalize_items(payload):
    raw_items = []
    if isinstance(payload, dict) and isinstance(payload.get("items"), list):
        raw_items = payload["items"]
    elif isinstance(payload, list):
        raw_items = payload
    items = []
    for idx, row in enumerate(raw_items):
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or row.get("headline") or row.get("text") or f"Item {idx + 1}").strip()
        summary = str(row.get("summary") or row.get("content") or "").strip()
        merged = f"{title} {summary}".strip()
        items.append(
            {
                "title": title,
                "date": str(
                    row.get("published_at")
                    or row.get("publishedAt")
                    or row.get("date")
                    or row.get("timestamp")
                    or ""
                ),
                "commodity": str(row.get("commodity") or "mixed").strip().lower() or "mixed",
                "region": infer_region(merged, str(row.get("region") or "")),
                "language": str(row.get("language") or row.get("lang") or "").strip().lower() or infer_language(merged),
                "signal": str(row.get("signal") or "neutral").strip().lower() or "neutral",
                "impact": float(row.get("impact") or 0),
                "source": str(row.get("source") or "web").strip().lower() or "web",
            }
        )
    return items


def fetch_monitor_context():
    if not MONITOR_CONTEXT_URL:
        return {}
    req = urllib.request.Request(
        MONITOR_CONTEXT_URL,
        headers={
            "accept": "application/json",
            "user-agent": "CroptoLast30DaysAIGenerator/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status < 200 or resp.status >= 300:
                return {}
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return {}


def market_dashboard_lines(payload, scope):
    rows = []
    if not isinstance(payload, dict):
        return rows
    for key in ("ua", "br", "ar", "us"):
        value = payload.get(key)
        if not isinstance(value, list):
            continue
        for row in value:
            if not isinstance(row, dict):
                continue
            region = key.upper()
            if scope == "en" and region == "UA":
                continue
            if scope == "uk" and region != "UA":
                continue
            commodity = str(row.get("commodity") or "mixed")
            price = row.get("price")
            basis = str(row.get("basis") or "")
            source = str(row.get("source") or row.get("provider") or "market-dashboard")
            as_of = str(row.get("asOf") or row.get("as_of") or "")
            rows.append(f"[{region}] {commodity} {basis} {price} {as_of} ({source})".strip())
    return rows[:18]


def build_last30_lines(items, scope):
    selected = []
    for row in items:
        is_uk = row["language"] == "uk" or row["region"] == "ukraine"
        if scope == "en" and is_uk:
            continue
        if scope == "uk" and not is_uk:
            continue
        selected.append(row)
    selected = selected[:24]
    lines = []
    for i, row in enumerate(selected):
        lines.append(
            f"{i + 1}. [{row['date'][:10]}] {row['commodity'].upper()} | {row['region']} | {row['signal']} | impact {row['impact']:.1f} | {row['title']}"
        )
    return selected, lines


def extract_text(payload):
    if isinstance(payload, dict) and isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"].strip()
    out = payload.get("output") if isinstance(payload, dict) else None
    chunks = []
    if isinstance(out, list):
        for item in out:
            content = item.get("content") if isinstance(item, dict) else None
            if not isinstance(content, list):
                continue
            for part in content:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    chunks.append(part["text"])
    return "\n".join(chunks).strip()


def call_openai(language, period_label, scope_label, last30_lines, monitor_lines):
    system_prompt = (
        "You are an agricultural market analyst. Write in Ukrainian. Keep it practical and concise."
        if language == "uk"
        else "You are an agricultural market analyst. Write in English. Keep it practical and concise."
    )
    user_prompt = "\n".join(
        [
            f"Time window: {period_label}.",
            f"Scope: {scope_label}.",
            "",
            "Use BOTH datasets below when building conclusions.",
            "",
            "Last30Days feed:",
            "\n".join(last30_lines) if last30_lines else "No records.",
            "",
            "Market dashboard context:",
            "\n".join(monitor_lines) if monitor_lines else "No records.",
            "",
            "Output format requirements:",
            "1) Start with one short paragraph: current market situation and directional tone.",
            "2) Then a 'Key facts' section with 4-6 bullets.",
            "3) Focus on implications for grains/oilseeds trading and brokerage decisions.",
            "4) Do not repeat raw dashboard metrics.",
        ]
    )

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(
            {
                "model": MODEL,
                "temperature": 0.2,
                "max_output_tokens": 700,
                "input": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            }
        ).encode("utf-8"),
        headers={
            "authorization": f"Bearer {OPENAI_API_KEY}",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return extract_text(payload)


def write_window(window_name, days, period_label, monitor_payload):
    src = read_json(OUT_DIR / f"{window_name}.json")
    if src is None:
        return False, f"{window_name}.json missing"
    items = normalize_items(src)
    en_items, en_lines = build_last30_lines(items, "en")
    uk_items, uk_lines = build_last30_lines(items, "uk")
    en_monitor_lines = market_dashboard_lines(monitor_payload, "en")
    uk_monitor_lines = market_dashboard_lines(monitor_payload, "uk")

    warnings = []
    en_text = ""
    uk_text = ""
    try:
        en_text = call_openai("en", period_label, "English + non-Ukraine markets", en_lines, en_monitor_lines)
    except Exception as error:
        warnings.append(f"en_failed: {error}")
    try:
        uk_text = call_openai("uk", period_label, "Ukraine market context", uk_lines, uk_monitor_lines)
    except Exception as error:
        warnings.append(f"uk_failed: {error}")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "filters": {"days": days},
        "sourceUpdatedAt": src.get("generatedAt") if isinstance(src, dict) else None,
        "warnings": warnings,
        "en": (
            {
                "language": "en",
                "scope": "English + non-Ukraine markets",
                "model": MODEL,
                "text": en_text,
                "inputCounts": {"last30days": len(en_items), "monitor": len(en_monitor_lines)},
            }
            if en_text
            else None
        ),
        "uk": (
            {
                "language": "uk",
                "scope": "Ukraine market context",
                "model": MODEL,
                "text": uk_text,
                "inputCounts": {"last30days": len(uk_items), "monitor": len(uk_monitor_lines)},
            }
            if uk_text
            else None
        ),
        "mode": "precomputed",
    }
    out_path = OUT_DIR / f"ai-summary-{days}.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return True, str(out_path)


def main():
    if not OPENAI_API_KEY:
        print("OPENAI_API_KEY is missing", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    monitor_payload = fetch_monitor_context()
    ok = True
    for window_name, days, period_label in WINDOWS:
        success, message = write_window(window_name, days, period_label, monitor_payload)
        if success:
            print(f"[ai-summary] generated {message}")
        else:
            ok = False
            print(f"[ai-summary] failed for {window_name}: {message}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
