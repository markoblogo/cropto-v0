# Cropto Deck Assets

This folder stores media for `/deck`.

## Place files here
- Hero images: `client/public/deck/hero/`
  - wired by default: `hero1.svg` ... `hero5.svg`
- Teaser video: `client/public/deck/video/`
  - required for native playback: `cropto-teaser.mp4`
  - optional: `cropto-teaser.webm`, `cropto-teaser-poster.jpg`
- Presentation PDF: `client/public/deck/presentations/cropto-investor-deck.pdf`

## Configure URLs/content
Edit `client/src/components/deck/deck-content.ts`:
- `CROPTO_DECK_HERO_IMAGES`
- `CROPTO_DECK_VIDEO_MP4_URL`
- `CROPTO_DECK_VIDEO_WEBM_URL`
- `CROPTO_DECK_VIDEO_POSTER_URL`
- `CROPTO_GOOGLE_SLIDES_PUBLIC_URL`
- `CROPTO_GOOGLE_SLIDES_EMBED_URL`
- `CROPTO_DECK_PDF_URL`
