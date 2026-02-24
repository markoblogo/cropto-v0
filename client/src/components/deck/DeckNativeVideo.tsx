import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CROPTO_DECK_VIDEO_MP4_URL,
  CROPTO_DECK_VIDEO_POSTER_URL,
  CROPTO_DECK_VIDEO_SOURCE_URL,
  CROPTO_DECK_VIDEO_WEBM_URL,
  DECK_PAGE_COPY,
} from "@/components/deck/deck-content";

export function DeckNativeVideo() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isReady, setIsReady] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

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
    if (!sectionRef.current || !videoRef.current) {
      return;
    }

    const videoElement = videoRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry || !videoElement || !isReady || prefersReducedMotion) {
          return;
        }

        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          void videoElement.play().catch(() => {
            // Ignore autoplay blocking and keep silent fallback behavior.
          });
        } else {
          videoElement.pause();
        }
      },
      { threshold: [0.2, 0.5, 0.8] },
    );

    observer.observe(sectionRef.current);

    return () => {
      observer.disconnect();
      videoElement.pause();
    };
  }, [isReady, prefersReducedMotion]);

  return (
    <section className="border-b border-border/60 py-16 sm:py-20">
      <div className="container mx-auto space-y-5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{DECK_PAGE_COPY.videoTitle}</h2>
          <p className="text-base leading-8 text-muted-foreground sm:text-lg">{DECK_PAGE_COPY.videoIntro}</p>
        </div>

        <Card className="overflow-hidden border-border/80 bg-card/80 shadow-lg">
          <CardContent className="p-0">
            <div ref={sectionRef} className="relative aspect-video w-full bg-black">
              {isReady ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={CROPTO_DECK_VIDEO_POSTER_URL}
                  onError={() => {
                    setIsReady(false);
                  }}
                >
                  <source src={CROPTO_DECK_VIDEO_WEBM_URL} type="video/webm" />
                  <source src={CROPTO_DECK_VIDEO_MP4_URL} type="video/mp4" />
                </video>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted/70 to-background p-8 text-center">
                  <div className="max-w-xl space-y-3">
                    <p className="text-base font-medium">Native teaser video is ready for integration.</p>
                    <p className="text-sm leading-7 text-muted-foreground">
                      Add `/deck/video/cropto-teaser.mp4` (optional webm/poster variants) and this section will autoplay on
                      viewport, muted, looped, and pause when out of view.
                    </p>
                    <Button variant="outline" asChild>
                      <a href={CROPTO_DECK_VIDEO_SOURCE_URL} target="_blank" rel="noreferrer">
                        Open source reference
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {isReady ? (
          <p className="text-xs text-muted-foreground">
            Playback is native HTML5 video, muted and looped, with viewport-based autoplay/pause behavior.
          </p>
        ) : null}
      </div>
    </section>
  );
}
