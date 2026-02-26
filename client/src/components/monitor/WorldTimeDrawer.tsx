import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ZONES = [
  { key: "ny", label: "New York", tz: "America/New_York" },
  { key: "lon", label: "London", tz: "Europe/London" },
  { key: "dub", label: "Dubai", tz: "Asia/Dubai" },
  { key: "del", label: "Delhi", tz: "Asia/Kolkata" },
  { key: "hkg", label: "Hong Kong", tz: "Asia/Hong_Kong" },
  { key: "syd", label: "Sydney", tz: "Australia/Sydney" },
] as const;

const STORAGE_KEY = "monitor_world_time_open";

type ZonedTimeInfo = {
  label: string;
  tz: string;
  timeLabel: string;
  dateLabel: string;
  hour24: number;
  minute: number;
  second: number;
  isNight: boolean;
};

function parsePart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((part) => part.type === type)?.value;
  const parsed = Number.parseInt(String(value || "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getZonedTime(now: Date, label: string, tz: string): ZonedTimeInfo {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).formatToParts(now);

  const hour24 = parsePart(parts, "hour");
  const minute = parsePart(parts, "minute");
  const second = parsePart(parts, "second");

  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";

  return {
    label,
    tz,
    timeLabel: `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    dateLabel: `${weekday} ${day} ${month}`.trim(),
    hour24,
    minute,
    second,
    isNight: hour24 < 7 || hour24 >= 19,
  };
}

function AnalogClockFace({ info }: { info: ZonedTimeInfo }) {
  const hourRotation = ((info.hour24 % 12) + info.minute / 60) * 30;
  const minuteRotation = (info.minute + info.second / 60) * 6;
  const secondRotation = info.second * 6;

  return (
    <svg viewBox="0 0 100 100" className="h-12 w-12 shrink-0" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r="46"
        className={cn(
          "transition-colors duration-300",
          info.isNight
            ? "fill-zinc-950 stroke-white/30"
            : "fill-zinc-50 stroke-black/35",
        )}
        strokeWidth="2"
      />
      <circle cx="50" cy="50" r="2.5" className={info.isNight ? "fill-white" : "fill-zinc-900"} />
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="30"
        strokeLinecap="round"
        strokeWidth="3.5"
        className={info.isNight ? "stroke-white" : "stroke-zinc-900"}
        transform={`rotate(${hourRotation} 50 50)`}
      />
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="22"
        strokeLinecap="round"
        strokeWidth="2.5"
        className={info.isNight ? "stroke-white/90" : "stroke-zinc-800"}
        transform={`rotate(${minuteRotation} 50 50)`}
      />
      <line
        x1="50"
        y1="54"
        x2="50"
        y2="20"
        strokeLinecap="round"
        strokeWidth="1.5"
        className={info.isNight ? "stroke-white/70" : "stroke-zinc-600"}
        transform={`rotate(${secondRotation} 50 50)`}
      />
    </svg>
  );
}

function ZoneCard({ info }: { info: ZonedTimeInfo }) {
  return (
    <div
      className={cn(
        "rounded-md border p-1.5",
        info.isNight
          ? "border-white/20 bg-zinc-950/75"
          : "border-black/25 bg-white/80",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">{info.label}</p>
        <span className={cn("text-[10px] uppercase tracking-wide", info.isNight ? "text-white/70" : "text-black/70")}>
          {info.isNight ? "Night" : "Day"}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <AnalogClockFace info={info} />
        <div className="min-w-0">
          <p className="text-base font-semibold tabular-nums leading-none">{info.timeLabel}</p>
          <p className="mt-1 text-[11px] text-foreground/70">{info.dateLabel}</p>
        </div>
      </div>
    </div>
  );
}

export function WorldTimeDrawer() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    try {
      const probe = new Date();
      ZONES.forEach((zone) => {
        getZonedTime(probe, zone.label, zone.tz);
      });
      setAvailable(true);
      setOpen(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
  }, [open]);

  const zones = useMemo(() => ZONES.map((zone) => getZonedTime(now, zone.label, zone.tz)), [now]);

  if (!available) return null;

  return (
    <aside
      className="fixed left-0 top-[38vh] z-[110]"
      aria-label="World time panel"
      aria-expanded={open}
      role="complementary"
    >
      <div
        className="relative flex items-stretch transition-transform duration-300 ease-out"
        style={{ transform: open ? "translateX(0)" : "translateX(calc(-100% + 36px))" }}
      >
        <div className="w-[310px] rounded-r-lg border border-l-0 border-black/65 bg-background/96 shadow-xl dark:border-white/25">
          <div className="flex items-center justify-between border-b border-black/15 px-3 py-2 dark:border-white/15">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">World Time</p>
              <p className="text-[10px] text-foreground/65">Market sessions at a glance</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 border border-black/20 p-0 dark:border-white/20"
              onClick={() => setOpen(false)}
              aria-label="Close world time panel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid gap-1.5 p-2">
            {zones.map((zone) => (
              <ZoneCard key={zone.tz} info={zone} />
            ))}
          </div>
          <div className="border-t border-black/15 px-3 py-1.5 text-[10px] text-foreground/60 dark:border-white/15">
            tick: 10s
          </div>
        </div>

        <button
          type="button"
          className="pointer-events-auto flex h-[92px] w-9 items-center justify-center rounded-r-md border border-l-0 border-black/65 bg-background/95 text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground shadow-md dark:border-white/25"
          aria-label="Toggle world time panel"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span className="-rotate-90">TIME</span>
        </button>
      </div>
    </aside>
  );
}
