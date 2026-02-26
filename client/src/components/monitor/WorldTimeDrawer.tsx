import { useEffect, useMemo, useState } from "react";
import { Globe2, X } from "lucide-react";
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

type WorldTimeDrawerProps = {
  open: boolean;
  onClose: () => void;
};

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

  return (
    <svg viewBox="0 0 100 100" className="h-16 w-16 shrink-0" aria-hidden="true">
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
        y2="20"
        strokeLinecap="round"
        strokeWidth="2.5"
        className={info.isNight ? "stroke-white/90" : "stroke-zinc-800"}
        transform={`rotate(${minuteRotation} 50 50)`}
      />
    </svg>
  );
}

function ZoneCard({ info }: { info: ZonedTimeInfo }) {
  return (
    <div
      className={cn(
        "rounded-md border p-2",
        info.isNight
          ? "border-white/20 bg-zinc-950/75"
          : "border-black/25 bg-white/80",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">{info.label}</p>
        <span className={cn("text-[10px] uppercase tracking-wide", info.isNight ? "text-white/70" : "text-black/70")}>
          {info.isNight ? "Night" : "Day"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <AnalogClockFace info={info} />
        <div className="min-w-0">
          <p className="text-xl font-semibold tabular-nums leading-none">{info.timeLabel}</p>
          <p className="mt-1 text-[11px] text-foreground/70">{info.dateLabel}</p>
          <p className="mt-0.5 text-[10px] text-foreground/55">{info.tz}</p>
        </div>
      </div>
    </div>
  );
}

export function WorldTimeDrawer({ open, onClose }: WorldTimeDrawerProps) {
  const [now, setNow] = useState(() => new Date());
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 640 : false));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 10_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const zones = useMemo(() => ZONES.map((zone) => getZonedTime(now, zone.label, zone.tz)), [now]);

  return (
    <div className={cn("pointer-events-none fixed inset-0 z-[120]", open ? "" : "")}> 
      <button
        type="button"
        aria-label="Close world time drawer"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/45 transition-opacity duration-200",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="World Time"
        className={cn(
          "absolute flex flex-col border-black/60 bg-background/95 text-foreground shadow-2xl transition-transform duration-300 dark:border-white/20",
          isMobile
            ? "bottom-0 left-0 right-0 h-[78vh] rounded-t-xl border-t"
            : "right-0 top-0 h-full w-[min(430px,100vw)] border-l",
          open
            ? "pointer-events-auto translate-x-0 translate-y-0"
            : isMobile
              ? "pointer-events-none translate-y-full"
              : "pointer-events-none translate-x-full",
        )}
      >
        <div className="flex items-start justify-between border-b border-black/15 px-4 py-3 dark:border-white/15">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em]">World Time</p>
            <p className="text-xs text-foreground/65">Market sessions at a glance</p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 border-black/30 dark:border-white/30"
            onClick={onClose}
            aria-label="Close world time panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid flex-1 gap-2 overflow-y-auto p-3 sm:grid-cols-2">
          {zones.map((zone) => (
            <ZoneCard key={zone.tz} info={zone} />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-black/15 px-4 py-2 text-[11px] text-foreground/60 dark:border-white/15">
          <span className="inline-flex items-center gap-1">
            <Globe2 className="h-3.5 w-3.5" />
            Global business coverage
          </span>
          <span>tick: 10s</span>
        </div>
      </aside>
    </div>
  );
}
