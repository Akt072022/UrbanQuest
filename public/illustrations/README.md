# Gate progression illustrations

Drop **24 PNG illustrations** in this folder (4 gates × 6 stages each).
The map and explore views auto-load these and fall back to SVG if a file is missing.

## Required filenames

```
public/illustrations/
├── g1/  (Hand — Impact)
│   ├── stage-0.png   ← closed fist (no progress)
│   ├── stage-1.png   ← 1 finger out
│   ├── stage-2.png   ← 2 fingers out
│   ├── stage-3.png   ← 3 fingers out
│   ├── stage-4.png   ← 4 fingers out
│   └── stage-5.png   ← open hand, 5 fingers spread
│
├── g2/  (Construction — Fit)
│   ├── stage-0.png   ← empty plot / surveyed ground
│   ├── stage-1.png   ← foundation laid
│   ├── stage-2.png   ← first walls / scaffolding
│   ├── stage-3.png   ← walls + windows
│   ├── stage-4.png   ← roof on
│   └── stage-5.png   ← finished townhouse / shop
│
├── g3/  (Tree — Anchoring)
│   ├── stage-0.png   ← seed in soil
│   ├── stage-1.png   ← sprout
│   ├── stage-2.png   ← young trunk + leaves
│   ├── stage-3.png   ← small tree
│   ├── stage-4.png   ← tree with thick canopy
│   └── stage-5.png   ← mature tree, deep roots visible
│
└── g4/  (Sun / Cycle — Sustainability)
    ├── stage-0.png   ← cloudy / dim sky
    ├── stage-1.png   ← sun rising, 2 rays
    ├── stage-2.png   ← sun with 4 rays
    ├── stage-3.png   ← sun with 6 rays
    ├── stage-4.png   ← bright sun, 8 rays
    └── stage-5.png   ← full sun + smiling face / radiant cycle
```

## Visual brief (for Midjourney / nanobanana)

Style anchor: bold black outline (3-4px), flat fills, single hue per stage,
chunky vintage sticker feel, similar to the **"Talk to my Hand"** game key art.
Square format (512×512 or 1024×1024), transparent background, **PNG**.

### Master prompt (paste into Midjourney/nanobanana, swap the {subject})

```
{subject}, single subject centered, bold thick black outline 3-4px,
flat color fill, sticker style, hand-drawn illustration, vintage poster vibe,
clean square composition, transparent background, no shadow, no text,
playful but minimal, color palette warm yellow #F5C84A and ink black #1C2530,
isolated subject, --ar 1:1 --style raw
```

### Per-gate {subject} replacements

**G1 — Hand** (warm orange/yellow palette `#C17B2A` accent):
- stage-0: `closed human fist, knuckles facing viewer`
- stage-1: `human hand showing one index finger pointing up, other fingers folded`
- stage-2: `human hand showing peace sign, two fingers up, thumb tucked`
- stage-3: `human hand showing three fingers up (index, middle, ring), thumb and pinky folded`
- stage-4: `human hand showing four fingers up, thumb folded across palm`
- stage-5: `open human hand, all five fingers spread wide, palm facing viewer, friendly wave`

**G2 — Construction** (blue palette `#1B5FA0` accent):
- stage-0: `empty surveyed building plot, marking flags, ground line`
- stage-1: `concrete foundation slab freshly poured, isometric tiny`
- stage-2: `wood scaffolding around two unfinished walls of a small building`
- stage-3: `small townhouse with walls and a window, no roof yet`
- stage-4: `townhouse with peaked roof, walls and window, simple shape`
- stage-5: `cute finished townhouse with roof, door, two windows, chimney smoke`

**G3 — Tree** (green palette `#2A6B45` accent):
- stage-0: `single seed in dark soil, small mound`
- stage-1: `young sprout breaking ground, two cotyledon leaves`
- stage-2: `young sapling with thin trunk and a few leaves`
- stage-3: `small tree with rounded canopy, single trunk`
- stage-4: `medium tree with full leafy canopy, small branches visible`
- stage-5: `mature tree with thick canopy and visible roots underground`

**G4 — Sun** (purple palette `#7A3A8E` accent, but the sun itself stays warm):
- stage-0: `dim cloud-covered sky, hint of sun behind clouds`
- stage-1: `small sun on the horizon, two rays`
- stage-2: `sun rising higher, four rays radiating`
- stage-3: `sun mid-sky with six rays radiating`
- stage-4: `bright full sun with eight rays radiating evenly`
- stage-5: `radiant full sun with eight long rays and a smiling face, joyful`

### Consistency tips

- Generate the 6 stages of one gate **in a single batch** so the style/character matches.
- Use `--seed` (Midjourney) or "consistent character" mode (nanobanana) within a gate.
- Keep ratio **1:1**, transparent background, output **PNG with alpha**.
- After generation, drop the PNGs in the corresponding `g1/`, `g2/`, `g3/`, `g4/` folder
  with the exact filenames `stage-0.png` … `stage-5.png`.
- The app reloads automatically (Vite HMR) — no rebuild needed.
