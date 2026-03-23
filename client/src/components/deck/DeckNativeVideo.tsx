import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CROPTO_DECK_VIDEO_SOURCE_URL,
  CROPTO_DECK_VIDEO_YOUTUBE_ID,
  DECK_PAGE_COPY,
} from "@/components/deck/deck-content";

type YTPlayerState = {
  PLAYING: number;
};

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  getPlayerState: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    elementId: string,
    options: {
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady?: (event: { target: YTPlayer }) => void;
        onError?: () => void;
      };
    },
  ) => YTPlayer;
  PlayerState: YTPlayerState;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    __croptoYouTubeApiPromise?: Promise<YTNamespace>;
  }
}

function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (window.__croptoYouTubeApiPromise) {
    return window.__croptoYouTubeApiPromise;
  }

  window.__croptoYouTubeApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load YouTube API"));
      document.head.appendChild(script);
    }

    const timeout = window.setTimeout(() => {
      reject(new Error("YouTube API load timeout"));
    }, 15000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (window.YT) {
        resolve(window.YT);
      } else {
        reject(new Error("YouTube API unavailable"));
      }
    };
  });

  return window.__croptoYouTubeApiPromise;
}

export function DeckNativeVideo() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const playerContainerIdRef = useRef(`deck-youtube-player-${Math.random().toString(36).slice(2, 10)}`);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [apiFailed, setApiFailed] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(mediaQuery.matches);

    onChange();
    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || playerRef.current) {
          return;
        }

        playerRef.current = new YT.Player(playerContainerIdRef.current, {
          videoId: CROPTO_DECK_VIDEO_YOUTUBE_ID,
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            loop: 1,
            playlist: CROPTO_DECK_VIDEO_YOUTUBE_ID,
          },
          events: {
            onReady: (event) => {
              event.target.mute();
              setIsPlayerReady(true);
            },
            onError: () => {
              setApiFailed(true);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setApiFailed(true);
        }
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!sectionRef.current || !playerRef.current || apiFailed) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry || !playerRef.current || !isPlayerReady) {
          return;
        }

        if (prefersReducedMotion) {
          playerRef.current.pauseVideo();
          return;
        }

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          playerRef.current.mute();
          playerRef.current.playVideo();
        } else {
          playerRef.current.pauseVideo();
        }
      },
      { threshold: [0.2, 0.5, 0.8] },
    );

    observer.observe(sectionRef.current);

    return () => {
      observer.disconnect();
      playerRef.current?.pauseVideo();
    };
  }, [apiFailed, isPlayerReady, prefersReducedMotion]);

  return (
    <section className="border-b border-border/60 py-14 sm:py-16">
      <div className="container mx-auto space-y-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{DECK_PAGE_COPY.videoTitle}</h2>
          <p className="text-base leading-8 text-foreground/82 sm:text-lg">{DECK_PAGE_COPY.videoIntro}</p>
        </div>

        <Card className="overflow-hidden border-black/85 dark:border-white/85 bg-gradient-to-b from-muted/70 via-card to-card shadow-xl transition-all duration-300 hover:border-primary/35 hover:shadow-2xl">
          <CardContent className="p-0">
            <div ref={sectionRef} className="relative aspect-video w-full bg-black">
              <div id={playerContainerIdRef.current} className="h-full w-full" />

              {apiFailed ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted/75 to-background p-8 text-center">
                  <div className="max-w-xl space-y-3">
                    <p className="text-base font-medium">Video player unavailable.</p>
                    <p className="text-base leading-7 text-foreground/82">
                      Open the teaser directly on YouTube while the embedded player is unavailable.
                    </p>
                    <Button asChild>
                      <a href={CROPTO_DECK_VIDEO_SOURCE_URL} target="_blank" rel="noreferrer">
                        Open on YouTube
                      </a>
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2 text-sm text-foreground/72">
          <span>Muted autoplay in viewport, loop enabled.</span>
          <Button variant="outline" size="sm" className="transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-md" asChild>
            <a href={CROPTO_DECK_VIDEO_SOURCE_URL} target="_blank" rel="noreferrer">
              Open on YouTube
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
