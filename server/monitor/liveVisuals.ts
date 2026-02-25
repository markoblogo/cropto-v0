import {
  LIVE_VISUALS_DEFAULT_REFRESH_SEC,
  LIVE_VISUALS_ENABLE_AUTO_REFRESH,
  LIVE_VISUALS_MAX_TILES,
  MONITOR_FEATURE_FLAGS,
} from "./config";
import { LIVE_VISUAL_SOURCES } from "./liveVisualsConfig";
import type { LiveVisualSourceConfig, LiveVisualTileData } from "./types";

function normalizeSource(source: LiveVisualSourceConfig): LiveVisualTileData {
  const nowIso = new Date().toISOString();
  const fallbackBase = {
    id: source.id,
    title: source.title,
    subtitle: source.subtitle || `${source.category} • ${source.region}`,
    category: source.category,
    region: source.region,
    providerType: source.providerType,
    sourceName: source.sourceName,
    externalUrl: source.externalUrl || source.url,
    checkedAt: nowIso,
    statusHint: source.statusHint,
    attribution: source.attribution,
    tags: source.tags || [],
  } as const;

  if (source.providerType === "embedded") {
    if (!source.embedUrl) {
      return {
        ...fallbackBase,
        renderMode: "fallback",
        status: "OFFLINE",
        error: "embedUrl_missing",
      };
    }

    return {
      ...fallbackBase,
      renderMode: "embed",
      status: "LIVE",
      previewUrl: source.embedUrl,
      updatedAt: nowIso,
    };
  }

  if (source.providerType === "image_refresh") {
    if (!source.imageUrl) {
      return {
        ...fallbackBase,
        renderMode: "fallback",
        status: "OFFLINE",
        error: "imageUrl_missing",
      };
    }

    return {
      ...fallbackBase,
      renderMode: "image",
      status: "REFRESH",
      previewUrl: source.imageUrl,
      refreshIntervalSec: source.refreshIntervalSec || LIVE_VISUALS_DEFAULT_REFRESH_SEC,
      updatedAt: nowIso,
    };
  }

  // external_link default
  return {
    ...fallbackBase,
    renderMode: source.previewImageUrl ? "external" : "fallback",
    status: "EXTERNAL",
    previewUrl: source.previewImageUrl,
    updatedAt: nowIso,
  };
}

export function getLiveVisualTiles() {
  const enabled = MONITOR_FEATURE_FLAGS.ENABLE_LIVE_VISUALS;
  const total = LIVE_VISUAL_SOURCES.length;
  const configuredEnabled = LIVE_VISUAL_SOURCES.filter((source) => source.enabled).length;

  if (!enabled) {
    return {
      enabled: false,
      settings: {
        maxTiles: LIVE_VISUALS_MAX_TILES,
        autoRefreshEnabled: LIVE_VISUALS_ENABLE_AUTO_REFRESH,
        defaultRefreshSec: LIVE_VISUALS_DEFAULT_REFRESH_SEC,
      },
      summary: {
        total,
        enabled: configuredEnabled,
        active: 0,
        disabled: total - configuredEnabled,
        fallback: 0,
        shownSourceIds: [] as string[],
      },
      tiles: [] as LiveVisualTileData[],
    };
  }

  const eligible = LIVE_VISUAL_SOURCES.filter((source) => source.enabled)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, Math.max(1, LIVE_VISUALS_MAX_TILES));

  const tiles = eligible.map(normalizeSource);
  const fallbackCount = tiles.filter((tile) => tile.renderMode === "fallback").length;

  return {
    enabled: true,
    settings: {
      maxTiles: LIVE_VISUALS_MAX_TILES,
      autoRefreshEnabled: LIVE_VISUALS_ENABLE_AUTO_REFRESH,
      defaultRefreshSec: LIVE_VISUALS_DEFAULT_REFRESH_SEC,
    },
    summary: {
      total,
      enabled: configuredEnabled,
      active: tiles.length,
      disabled: total - configuredEnabled,
      fallback: fallbackCount,
      shownSourceIds: tiles.map((tile) => tile.id),
    },
    tiles,
  };
}
