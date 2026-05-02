#!/usr/bin/env bash
# Generate slide-3 PNG thumbnails for every OVPM canvas in public/canvas/.
#
# Output goes to public/canvas-thumbs/OVPM-NNN.png — exactly where the
# app expects them (see src/data/canvas.js → canvasThumbUrl).
#
# Strategy:
#   1. Prefer LibreOffice headless (works everywhere, fast):
#        macOS:  brew install --cask libreoffice && brew install poppler
#        Linux:  apt-get install libreoffice poppler-utils
#   2. On macOS, fall back to Keynote via AppleScript if LibreOffice
#      isn't installed — slower (~5–10 s per file) but already on disk.
#
# Re-run after every change in public/canvas/.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/public/canvas"
OUT_DIR="$ROOT/public/canvas-thumbs"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$OUT_DIR"

# ─── Path A: LibreOffice ────────────────────────────────────────
SOFFICE=""
for candidate in soffice "/Applications/LibreOffice.app/Contents/MacOS/soffice" libreoffice; do
  if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then
    SOFFICE="$candidate"
    break
  fi
done

if [ -n "$SOFFICE" ] && command -v pdftoppm >/dev/null 2>&1; then
  echo "[libreoffice] $SOFFICE + pdftoppm — converting…"
  count=0
  for pptx in "$SRC_DIR"/OVPM-*.pptx; do
    [ -e "$pptx" ] || continue
    base="$(basename "$pptx" .pptx)"
    id="${base:5:3}"
    "$SOFFICE" --headless --convert-to pdf --outdir "$TMP_DIR" "$pptx" >/dev/null
    pdf="$TMP_DIR/$base.pdf"
    [ -f "$pdf" ] || { echo "warn: conversion failed for $base" >&2; continue; }
    pdftoppm -f 3 -l 3 -r 110 -png "$pdf" "$TMP_DIR/$base"
    rendered="$(ls "$TMP_DIR"/${base}-*.png 2>/dev/null | head -1 || true)"
    [ -n "$rendered" ] || { echo "warn: no slide-3 PNG for $base" >&2; continue; }
    cp "$rendered" "$OUT_DIR/OVPM-${id}.png"
    count=$((count + 1))
    printf '\r  %d thumbs…' "$count"
  done
  echo
  echo "done. ${count} thumbnails written to $OUT_DIR"
  exit 0
fi

# ─── Path B: Keynote on macOS ────────────────────────────────────
if [ "$(uname -s)" != "Darwin" ] || [ ! -d "/Applications/Keynote.app" ]; then
  echo "error: neither LibreOffice nor Keynote is available." >&2
  echo "  install LibreOffice: https://www.libreoffice.org/download/" >&2
  exit 1
fi

echo "[keynote] LibreOffice not found; using Keynote via AppleScript."
echo "         expect ~5–10 s per file (Keynote will open and close repeatedly)."

# Boot Keynote once so the first iteration isn't slow
osascript -e 'tell application "Keynote" to activate' >/dev/null 2>&1 || true
sleep 1

count=0
fail=0
for pptx in "$SRC_DIR"/OVPM-*.pptx; do
  [ -e "$pptx" ] || continue
  base="$(basename "$pptx" .pptx)"
  id="${base:5:3}"
  workdir="$TMP_DIR/$id"
  mkdir -p "$workdir"

  if osascript >/dev/null 2>&1 <<OSA
tell application "Keynote"
    activate
    set thePres to open POSIX file "$pptx"
    delay 1
    export thePres to (POSIX file "$workdir") as slide images with properties {image format:PNG, export style:IndividualSlides}
    close thePres saving no
end tell
OSA
  then
    # Keynote names files "<folder>.001.png", ".002.png", … so slide 3 is the .003 file.
    rendered="$(ls "$workdir"/*.003.png 2>/dev/null | head -1 || true)"
    if [ -n "$rendered" ]; then
      cp "$rendered" "$OUT_DIR/OVPM-${id}.png"
      count=$((count + 1))
    else
      fail=$((fail + 1))
      echo "warn: no slide-3 PNG for $base" >&2
    fi
  else
    fail=$((fail + 1))
    echo "warn: keynote export failed for $base" >&2
  fi
  printf '\r  %d ok / %d fail …' "$count" "$fail"
done
echo
echo "done. ${count} thumbnails written to $OUT_DIR (${fail} failures)."
