# LYS — Local Yarn Store

Concept prototypes for a 3D-in-browser yarn shop game. No build step: plain ES modules, three.js
from a CDN, served statically.

## Running

```sh
npm run serve      # http://localhost:8765  (no-cache dev server)
npm run lint       # ESLint, flat config
```

Use `serve.py`, **not** `python3 -m http.server`. Plain `http.server` sends `Last-Modified`, so
browsers answer 304 and keep serving stale ES modules. That is merely confusing when a function
body changes and *fatal* when a module gains an export — the importing module fails to link and the
page renders blank white. `serve.py` sends `no-store` and purges the origin cache on each document
load.

Every viewer logs a build marker on startup:

```
LYS build 2026-09-06.6-shared-materials
```

If that value looks old, the browser is running cached code and nothing you changed is live.

## Viewers

| Page | Question it answers |
| --- | --- |
| `index.html` | The front door: the game's entrance and loading screen. See `ai_planning_sessions/VISUAL-DESIGN-2D.md`. |
| `characters/species-checker.html` | Do two species read as different animals? Tuning surface, one character at a time. |
| `characters/crowd.html` | Does the randomiser make a cast or a zoo? Performance instrumentation lives here. |
| `characters/puzzle.html` | Is the arrangement a PUZZLE? One customer, one display, and a switch on every hint. |
| `characters/motion-lab.html` | Does motion survive being interrupted, and does personality read in how a character moves? See `characters/MOTION-TODO.md`. |
| `characters/store.html` | The game. Visit loop, displays, the full sim. |
| `inventory/stash-and-stuff.html` | Does the placement mechanic feel good? Notion look and drag behaviour. |

## Layout




```
ai_planning_sessions/ Human and AI readable written out specs for how the game should work. "DESIGN-DECISIONS.md" files at each level contain more details as the result of planning sessions. 

CODE (including demo and test code) lives here: 

characters/      npc.js (shared rig) + owl.js / llama.js (species kits) + viewers
inventory/       notions.js (instanced billboards, slot grid) + viewer
store/           depends on other pieces. 

serve.py         no-cache dev server
```

## Notion atlas

Source art is black line art; the pipeline bakes **shape only** into an alpha channel. Colour,
outline and gradient are runtime work, so a theme that only recolours ships no new images.

```sh
cd ai_planning_sessions/inventory/illustrations
pip install Pillow
python3 notion_processing.py                      # default set
python3 notion_processing.py --theme cottage      # a theme's overrides layered on top
```

Outputs `build/<theme>.png`, `build/<theme>.json` (UV manifest) and `build/<theme>-preview.png`.
The atlas itself renders as a blank white rectangle — shape lives in alpha — so **the preview is
what you review**.

## Measuring performance

Target is cheap tablets, so all claims are measured under **20x CPU throttling** in Chrome DevTools,
not on unthrottled Apple silicon. DevTools must stay open for throttling to apply; that makes the
number conservative rather than wrong.

Two rules learned the hard way:

1. **Frame the whole scene before reading the overlay** (`F` in the crowd view). Culled objects are
   not drawn, so a zoomed-in camera silently reports a fraction of the real cost.
2. **Sanity-check draw-calls-per-character against the known mesh count.** A reading of 12 for a
   character with ~35 meshes means the scene is being culled, not that the code got faster.
