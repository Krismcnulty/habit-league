# Habit League

Your habits are your squad. Every day is a basketball game against a fictional opponent.

A solo prototype: a 12-team league, a daily game that locks at 4am, a league table, and top-8 best-of-3 playoffs over the last nine days of each month. Squads lock at tip-off, with one transfer in the first week and an injury list.

Installable web app (PWA). Data is stored on the device; use **Club → Save backup** to keep a copy.

Live: https://krismcnulty.github.io/habit-league/

## Custom art

Player heads, team logos, kits and player backgrounds can be added without touching the code. They live in `art/library.json` (live in the app) and `art/drafts.json` (saved, not in the app).

- Make them in **Pixel Studio** (krismcnulty.github.io/pixel-studio, repo `Krismcnulty/pixel-studio`) and press **Submit to app**. That opens an issue labelled `art` (or `art-draft`).
- `.github/workflows/art.yml` runs `tools/art-intake.js` on issues opened by the repo owner. It checks the design, saves it, bumps `sw.js`, replies with a preview from `art/previews/` and closes the issue.
- Formats (all have `id`, `name`, `rarity` rare/epic/leg and `where` shop/none):
  - `head`: `pal` + `px`, 32×32
  - `logo`: `pal` + `px`, 16×16
  - `kit`: `b`, `t`, `num`, `pat`, optional `ns`, `sw`, `font`, `fw`
  - `pbg`: `base` (a built-in background) + `colors` (`{"#old":"#new"}`)
- `window.HL_ART` in `index.html` exposes the app's drawing code so Pixel Studio previews art exactly as the app draws it. Change both repos together.
