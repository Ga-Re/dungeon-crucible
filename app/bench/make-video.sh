#!/usr/bin/env bash
# Renderer benchmark (T-105d): makes the benchmark's 4K video map. The benchmark loads it like any
# map, from the library (the app's content policy only lets media come from there), so copy the
# result to <your library>/maps/bench-4k.mp4.
#   npm run bench:video   → a synthetic 4K H.264 video (needs ffmpeg)
# Options: BENCH_VIDEO_SECONDS (default 40), BENCH_VIDEO_FPS (default 30; animated maps are often
# 30, some 60). The file goes to app/bench-assets/ (git-ignored) and is never committed.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/bench-assets"
# 40 s: longer than warm-up + measurement, so the loop restart never falls into a measurement.
LENGTH="${BENCH_VIDEO_SECONDS:-40}"
FPS="${BENCH_VIDEO_FPS:-30}"
mkdir -p "$DIR"
if ! command -v ffmpeg >/dev/null; then
  echo "ffmpeg not found. Install it with: brew install ffmpeg" >&2
  exit 1
fi
echo "Generating a ${LENGTH}s 4K test video at ${FPS} fps (this can take a minute) …"
# Moving test pattern plus temporal noise: every frame changes, so the bitrate (~40 Mbit/s) is in
# the range of real animated 4K maps and the decoder cannot coast.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "testsrc2=size=3840x2160:rate=${FPS}" \
  -vf "noise=alls=18:allf=t+u" -t "$LENGTH" \
  -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
  -b:v 40M -maxrate 50M -bufsize 80M -movflags +faststart -f mp4 \
  "$DIR/bench-4k.mp4"
echo "Done: $DIR/bench-4k.mp4"
echo "Copy it into your campaign folder as maps/bench-4k.mp4 and start with VITE_BENCH_VIDEO=<absolute path> npm run bench."
