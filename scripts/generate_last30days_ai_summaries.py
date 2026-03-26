#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.request
import urllib.error
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path


OUT_DIR = Path(os.environ.get("LAST30DAYS_OUTPUT_DIR", "artifacts/last30days")).resolve()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
MODEL = os.environ.get("LAST30DAYS_AI_MODEL", "gpt-4.1-mini").strip()
MONITOR_CONTEXT_URL = os.environ.get(
    "LAST30DAYS_MONITOR_CONTEXT_URL",
    "https://cropto.abvx.xyz/api/market-dashboard?debugSources=1",
).strip()
MONITOR_NEWS_URL = os.environ.get(
    "LAST30DAYS_MONITOR_NEWS_URL",
    "https://cropto.abvx.xyz/api/monitor/news?time=7d",
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

def parse_iso_date(value: str):
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw).date()
    except Exception:
        return None

def parse_iso_datetime(value: str):
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return datetime.fromisoformat(raw)
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

def fetch_monitor_news():
    if not MONITOR_NEWS_URL:
        return []
    req = urllib.request.Request(
        MONITOR_NEWS_URL,
        headers={
            "accept": "application/json",
            "user-agent": "CroptoLast30DaysAIGenerator/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            if resp.status < 200 or resp.status >= 300:
                return []
            payload = json.loads(resp.read().decode("utf-8"))
            feed = payload.get("feed") if isinstance(payload, dict) else None
            return feed if isinstance(feed, list) else []
    except Exception:
        return []


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
    selected.sort(key=lambda x: parse_iso_datetime(x.get("date", "")) or datetime(1970, 1, 1), reverse=True)
    selected = selected[:24]
    lines = []
    for i, row in enumerate(selected):
        lines.append(
            f"{i + 1}. [{row['date'][:10]}] {row['commodity'].upper()} | {row['region']} | {row['signal']} | impact {row['impact']:.1f} | {row['title']} [{row['source']}]"
        )
    return selected, lines

def scope_filter(items, scope):
    selected = []
    for row in items:
        is_uk = row["language"] == "uk" or row["region"] == "ukraine"
        if scope == "en" and is_uk:
            continue
        if scope == "uk" and not is_uk:
            continue
        selected.append(row)
    return selected

def build_period_comparison_metrics(all_items, scope, days):
    scoped = scope_filter(all_items, scope)
    by_day = {}
    for row in scoped:
        d = parse_iso_date(row["date"])
        if not d:
            continue
        bucket = by_day.setdefault(d.isoformat(), {"count": 0, "impact_sum": 0.0, "bullish": 0, "bearish": 0})
        bucket["count"] += 1
        bucket["impact_sum"] += float(row.get("impact") or 0.0)
        if row.get("signal") == "bullish":
            bucket["bullish"] += 1
        if row.get("signal") == "bearish":
            bucket["bearish"] += 1

    if not by_day:
        return {"notes": "No temporal metrics available."}

    latest_day = max(by_day.keys())
    latest_date = datetime.fromisoformat(latest_day).date()

    def aggregate(start_date, end_date):
        out = {"count": 0, "impact_sum": 0.0, "bullish": 0, "bearish": 0, "days": 0}
        d = start_date
        while d <= end_date:
            key = d.isoformat()
            row = by_day.get(key)
            if row:
                out["count"] += row["count"]
                out["impact_sum"] += row["impact_sum"]
                out["bullish"] += row["bullish"]
                out["bearish"] += row["bearish"]
            out["days"] += 1
            d += timedelta(days=1)
        out["avg_impact"] = round(out["impact_sum"] / max(out["count"], 1), 2)
        out["balance"] = out["bullish"] - out["bearish"]
        return out

    if days == 1:
        current = aggregate(latest_date, latest_date)
        prev = aggregate(latest_date - timedelta(days=1), latest_date - timedelta(days=1))
        return {"latest_day": latest_day, "current": current, "previous_day": prev, "comparison": "day_vs_prev_day"}
    if days == 7:
        current = aggregate(latest_date - timedelta(days=6), latest_date)
        prev = aggregate(latest_date - timedelta(days=13), latest_date - timedelta(days=7))
        return {"latest_day": latest_day, "current": current, "previous_week": prev, "comparison": "week_vs_prev_week"}

    current = aggregate(latest_date - timedelta(days=29), latest_date)
    prev = aggregate(latest_date - timedelta(days=59), latest_date - timedelta(days=30))
    regime_recent = aggregate(latest_date - timedelta(days=14), latest_date)
    regime_early = aggregate(latest_date - timedelta(days=29), latest_date - timedelta(days=15))
    return {
        "latest_day": latest_day,
        "current": current,
        "previous_month_if_available": prev,
        "intra_month_regime": {"early_15d": regime_early, "recent_15d": regime_recent},
        "comparison": "month_vs_prev_month_or_regime",
    }

def top_headlines(rows, limit=6):
    ranked = sorted(rows, key=lambda r: float(r.get("impact") or 0), reverse=True)[:limit]
    out = []
    for row in ranked:
        out.append(
            {
                "date": str(row.get("date") or "")[:10],
                "commodity": str(row.get("commodity") or "mixed"),
                "signal": str(row.get("signal") or "neutral"),
                "impact": round(float(row.get("impact") or 0), 2),
                "title": str(row.get("title") or ""),
                "source": str(row.get("source") or "web"),
            }
        )
    return out

def build_fact_pack(period_items, all_items_scope, days):
    if not period_items:
        return {"window": {}, "changes": {}, "headlines": [], "note": "No records in period scope."}

    dates = [parse_iso_date(str(r.get("date") or "")) for r in period_items]
    dates = [d for d in dates if d]
    latest_date = max(dates) if dates else datetime.now(timezone.utc).date()
    if days == 1:
        start = latest_date
    elif days == 7:
        start = latest_date - timedelta(days=6)
    else:
        start = latest_date - timedelta(days=29)

    current_rows = []
    prev_rows = []
    prev_start = start - timedelta(days=days)
    prev_end = start - timedelta(days=1)
    for row in all_items_scope:
        d = parse_iso_date(str(row.get("date") or ""))
        if not d:
            continue
        if start <= d <= latest_date:
            current_rows.append(row)
        if prev_start <= d <= prev_end:
            prev_rows.append(row)

    current_count = len(current_rows)
    prev_count = len(prev_rows)
    current_impact = round(sum(float(r.get("impact") or 0) for r in current_rows) / max(current_count, 1), 2)
    prev_impact = round(sum(float(r.get("impact") or 0) for r in prev_rows) / max(prev_count, 1), 2)

    curr_sig = Counter(str(r.get("signal") or "neutral") for r in current_rows)
    prev_sig = Counter(str(r.get("signal") or "neutral") for r in prev_rows)
    curr_com = Counter(str(r.get("commodity") or "mixed") for r in current_rows)
    prev_com = Counter(str(r.get("commodity") or "mixed") for r in prev_rows)
    curr_reg = Counter(str(r.get("region") or "global") for r in current_rows)

    movers = []
    for key in set(curr_com.keys()).union(prev_com.keys()):
        diff = curr_com.get(key, 0) - prev_com.get(key, 0)
        movers.append({"commodity": key, "delta_count": diff, "current": curr_com.get(key, 0), "previous": prev_com.get(key, 0)})
    movers.sort(key=lambda x: abs(x["delta_count"]), reverse=True)

    return {
        "window": {
            "from": start.isoformat(),
            "to": latest_date.isoformat(),
            "records": current_count,
            "avg_impact": current_impact,
            "top_commodities": curr_com.most_common(5),
            "top_regions": curr_reg.most_common(4),
            "signal_mix": {
                "bullish": curr_sig.get("bullish", 0),
                "bearish": curr_sig.get("bearish", 0),
                "neutral": curr_sig.get("neutral", 0),
            },
        },
        "changes": {
            "comparison_window": {"from": prev_start.isoformat(), "to": prev_end.isoformat(), "records": prev_count, "avg_impact": prev_impact},
            "delta_records": current_count - prev_count,
            "delta_avg_impact": round(current_impact - prev_impact, 2),
            "delta_signal_balance": (curr_sig.get("bullish", 0) - curr_sig.get("bearish", 0)) - (prev_sig.get("bullish", 0) - prev_sig.get("bearish", 0)),
            "commodity_movers": movers[:6],
        },
        "headlines": top_headlines(current_rows, limit=8),
    }

def build_spike_lines(news_items, scope, days):
    if days == 1:
        return []
    out = []
    for row in news_items:
        if not isinstance(row, dict):
            continue
        source = str(row.get("source_name") or row.get("source") or "").lower()
        title = str(row.get("title") or "").strip()
        summary = str(row.get("summary") or "").strip()
        lang = str(row.get("lang") or "").lower()
        if "spike" not in source and "spike" not in title.lower() and "spike" not in summary.lower():
            continue
        if scope == "uk" and not (lang == "uk" or re.search(r"[іїєґ]|[а-яё]", title.lower() + " " + summary.lower())):
            continue
        if scope == "en" and (lang == "uk" or re.search(r"[іїєґ]|[а-яё]", title.lower() + " " + summary.lower())):
            continue
        published_raw = str(row.get("published_at") or "")
        published = published_raw[:10]
        if published:
            pdate = parse_iso_date(published_raw) or parse_iso_date(published)
            if pdate:
                max_age = 10 if days == 7 else 40
                if (datetime.now(timezone.utc).date() - pdate).days > max_age:
                    continue
        line = f"[{published}] {title}"
        if summary:
            line += f" | {summary[:160]}"
        out.append(line)
    return out[:8]


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

def extract_json_object(text: str):
    raw = (text or "").strip()
    if not raw:
        return None
    fenced = re.search(r"```json\s*([\s\S]+?)```", raw, re.IGNORECASE)
    candidate = fenced.group(1).strip() if fenced else raw
    try:
        return json.loads(candidate)
    except Exception:
        pass
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(candidate[start : end + 1])
        except Exception:
            return None
    return None


def _call_openai_once(system_prompt, user_prompt):
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(
            {
                "model": MODEL,
                "temperature": 0.15,
                "max_output_tokens": 900,
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
    text = extract_text(payload)
    parsed = extract_json_object(text)
    if isinstance(parsed, dict) and isinstance(parsed.get("summary"), str):
        return parsed
    return {"summary": text, "chart": None}

def summary_too_generic(text):
    plain = (text or "").strip().lower()
    if not plain:
        return True
    generic_markers = [
        "remains broadly neutral",
        "mixed signals",
        "cautious approach",
        "maintaining flexibility",
    ]
    has_numbers = bool(re.search(r"\d", plain))
    marker_hits = sum(1 for marker in generic_markers if marker in plain)
    return (not has_numbers) or marker_hits >= 2

def call_openai(language, period_label, scope_label, last30_lines, monitor_lines, period_metrics, fact_pack, spike_lines, days):
    system_prompt = (
        "You are a senior grains & oilseeds analyst. Write in Ukrainian."
        if language == "uk"
        else "You are a senior grains & oilseeds analyst. Write in English."
    )
    chart_hint = (
        "For Yesterday: output 3-5 category bars (for example: logistics pressure, demand pulse, price pressure, execution risk). No line chart."
        if days == 1
        else "For Week: output exactly 7 points day-by-day from window start to window end."
        if days == 7
        else "For 30 Days: output exactly 4 weekly buckets (W1..W4)."
    )
    user_prompt = "\n".join(
        [
            f"Time window: {period_label}.",
            f"Scope: {scope_label}.",
            "",
            "Use BOTH datasets below when building conclusions.",
            "Temporal comparison is mandatory; explicitly mention what changed vs previous comparable period.",
            "",
            "Last30Days feed:",
            "\n".join(last30_lines) if last30_lines else "No records.",
            "",
            "Market dashboard context:",
            "\n".join(monitor_lines) if monitor_lines else "No records.",
            "",
            "Temporal metrics:",
            json.dumps(period_metrics, ensure_ascii=False),
            "",
            "Period fact pack (must be referenced directly):",
            json.dumps(fact_pack, ensure_ascii=False),
            "",
            "Spike weekly notes (if available):",
            "\n".join(spike_lines) if spike_lines else "No spike weekly notes in scope.",
            "",
            "Output format requirements:",
            "1) Produce concise analyst note in this exact structure: 'General situation', 'What changed vs previous comparable period', 'Actionable implications for trading/brokerage', 'Key facts'.",
            "2) In 'Key facts' provide 4-6 bullets with concrete numbers and dates from supplied data (not generic phrases).",
            "3) Do not repeat dashboard labels and do not list source names in every bullet.",
            "4) Build period-specific logic strictly: yesterday => yesterday events + vs previous day; week => week dynamics + vs previous week; month => 30d regime + vs previous month if available, else early-vs-late month.",
            "5) If Spike weekly note exists (especially for UK and week/month), integrate 1-2 concrete operational insights from it.",
            "6) Keep total summary length 900-1400 characters.",
            "",
            "Return STRICT JSON with this schema:",
            '{ "summary": "text", "chart": { "type": "bars|line|weekly_bars", "title": "short", "points": [ {"label":"...", "value": number } ] } }',
            f"Chart rule: {chart_hint}",
        ]
    )

    parsed = _call_openai_once(system_prompt, user_prompt)
    summary = str(parsed.get("summary") or "").strip()
    if summary_too_generic(summary):
        retry_prompt = "\n".join(
            [
                user_prompt,
                "",
                "Previous draft was too generic. Rewrite with tighter factual grounding.",
                "Mandatory: include at least 4 numeric values and at least 2 explicit dates from window/context.",
                "Mandatory: explicitly describe one change versus previous comparable period.",
            ]
        )
        retried = _call_openai_once(system_prompt, retry_prompt)
        if str(retried.get("summary") or "").strip():
            return retried
    return parsed


def write_window(window_name, days, period_label, monitor_payload, monitor_news_payload, all_items_month):
    src = read_json(OUT_DIR / f"{window_name}.json")
    if src is None:
        return False, f"{window_name}.json missing"
    items = normalize_items(src)
    en_items, en_lines = build_last30_lines(items, "en")
    uk_items, uk_lines = build_last30_lines(items, "uk")
    en_monitor_lines = market_dashboard_lines(monitor_payload, "en")
    uk_monitor_lines = market_dashboard_lines(monitor_payload, "uk")
    en_scope_all = scope_filter(all_items_month, "en")
    uk_scope_all = scope_filter(all_items_month, "uk")
    en_metrics = build_period_comparison_metrics(all_items_month, "en", days)
    uk_metrics = build_period_comparison_metrics(all_items_month, "uk", days)
    en_fact_pack = build_fact_pack(en_items, en_scope_all, days)
    uk_fact_pack = build_fact_pack(uk_items, uk_scope_all, days)
    en_spike_lines = build_spike_lines(monitor_news_payload, "en", days)
    uk_spike_lines = build_spike_lines(monitor_news_payload, "uk", days)

    warnings = []
    en_payload = None
    uk_payload = None
    try:
        en_payload = call_openai(
            "en",
            period_label,
            "English + non-Ukraine markets",
            en_lines,
            en_monitor_lines,
            en_metrics,
            en_fact_pack,
            en_spike_lines,
            days,
        )
    except Exception as error:
        warnings.append(f"en_failed: {error}")
    try:
        uk_payload = call_openai(
            "uk",
            period_label,
            "Ukraine market context",
            uk_lines,
            uk_monitor_lines,
            uk_metrics,
            uk_fact_pack,
            uk_spike_lines,
            days,
        )
    except Exception as error:
        warnings.append(f"uk_failed: {error}")

    if not (en_payload and str(en_payload.get("summary", "")).strip()) and not (uk_payload and str(uk_payload.get("summary", "")).strip()):
        # Keep previously generated file intact if fresh generation failed for both languages.
        return True, f"{window_name}: skipped overwrite (no fresh AI summaries)"

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
                "text": str(en_payload.get("summary", "")).strip(),
                "chart": en_payload.get("chart"),
                "inputCounts": {"last30days": len(en_items), "monitor": len(en_monitor_lines)},
            }
            if en_payload and str(en_payload.get("summary", "")).strip()
            else None
        ),
        "uk": (
            {
                "language": "uk",
                "scope": "Ukraine market context",
                "model": MODEL,
                "text": str(uk_payload.get("summary", "")).strip(),
                "chart": uk_payload.get("chart"),
                "inputCounts": {"last30days": len(uk_items), "monitor": len(uk_monitor_lines)},
            }
            if uk_payload and str(uk_payload.get("summary", "")).strip()
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
    monitor_news_payload = fetch_monitor_news()
    month_src = read_json(OUT_DIR / "month.json")
    all_items_month = normalize_items(month_src or {})
    ok = True
    for window_name, days, period_label in WINDOWS:
        success, message = write_window(
            window_name,
            days,
            period_label,
            monitor_payload,
            monitor_news_payload,
            all_items_month,
        )
        if success:
            print(f"[ai-summary] generated {message}")
        else:
            ok = False
            print(f"[ai-summary] failed for {window_name}: {message}", file=sys.stderr)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
