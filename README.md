<p align="center">
    <img src="public/favicon.svg" width="128"/>
</p>

<h1 align="center">BreakCraft</h1>

<p align="center">
    Turn a screenplay into a production breakdown — entirely in your browser.
</p>

---

BreakCraft imports a screenplay, derives everything a parser can derive with
certainty, lets a producer tag the rest by hand, and exports the result as a
spreadsheet, breakdown sheets, a tagged script, or a schedule for
[PlanCraft](https://www.hasielhassan.com/PlanCraft/).

There is no server, no account and no upload. The script is parsed, tagged and
exported in the browser tab, and saved only to that browser's local storage.
Screenplays are confidential material; that is the reason the app is built this
way, not an incidental property of it.

---

## What is deterministic, and what is not

This distinction runs through the whole codebase and is worth being explicit
about.

**Derived by parsing — correct the moment a script is imported:**

| Output | How |
|---|---|
| Scene list, order, scene numbers | Element dispatch |
| INT/EXT, set, time of day, modifiers | Slugline grammar |
| Speaking cast per scene | Character cues, with alias merging |
| Page count and eighths per scene | Fixed-pitch pagination arithmetic |
| Day Out of Days | Set algebra over the above |
| Set report, cast matrix, dialogue counts | Grouping and counting |

**Tagged by you:** props, wardrobe, vehicles, animals, stunts, SFX, VFX, sound,
set dressing, makeup, special equipment, background. These live in free-text
action lines and cannot be extracted reliably without judgement.

---

## Features

* **Import** — Fountain, Final Draft (`.fdx`) and ScreenJSON. Format is detected
  from content, not the file extension. Anything the parser had to guess, drop or
  repair is reported rather than swallowed.
* **Paginated script view** — real US Letter pages in Courier, with page numbers
  and scene numbers in the margin. What is on screen is exactly what was measured
  for the page counts and eighths.
* **Select-to-tag** — highlight any words in an action line or dialogue, pick a
  category, name the element. Tags are anchored to a specific element and
  character range, not to a scene.
* **Apply everywhere** — when you confirm a term, BreakCraft offers to tag every
  other whole-word occurrence in the script. Matching is literal and
  case-insensitive, so the count shown is exactly what will be created.
* **Category registry** — 15 built-in departments, each recolorable and
  re-iconable, plus fully custom categories with their own ScreenJSON mapping,
  from the Categories menu.
* **Breakdown modes** — Live Action and Animation narrow the default categories
  shown, or create your own mode; each can rename any category (its own
  vocabulary, e.g. "Cast" → "Characters"), and choose which report columns
  appear, from the Modes menu. Tagged data is never hidden by a mode, only its
  default view.
* **Element library** — every tagged element grouped by category with its scene
  numbers, plus rename, re-categorise, quantity, department, notes and merge —
  alongside auto-derived Cast and Sets sections, which can themselves be merged
  (to consolidate two spellings) or hidden, without touching the script.
* **Breakdown grid** — one row per scene with a column per category, filterable.
* **Estimated duration** — set a minutes-per-page average and every scene, plus
  the whole script, gets an estimated runtime.
* **Reports** — summary, scenes, elements, Day Out of Days, sets, and one sheet
  per populated category.
* **Guided tour** — an interactive walkthrough of every view and menu, restart
  anytime from the Help menu.
* **Undo/redo** across every breakdown action — tags, categories, modes and
  scene notes alike.
* **Autosave** to local storage, with session restore.

---

## Exports

| Format | Notes |
|---|---|
| ScreenJSON (clean) | The screenplay only, portable to any ScreenJSON tool |
| ScreenJSON (tagged) | Scene tag arrays populated, every tag written as a coloured `note` highlight |
| Fountain | Plain-text screenplay |
| Final Draft `.fdx` | Round-trips to Final Draft, Movie Magic and Storyboard Pro |
| Script (PDF) | Direct PDF export, paginated exactly as the viewer measures it, with a cover page |
| Excel `.xlsx` | Every report as a colour-coded sheet |
| CSV bundle | One CSV per report, zipped |
| Breakdown sheets (PDF) | Direct PDF export, one page per scene, cover included |
| Breakdown sidecar | The lossless tag record — re-import it to carry on working |
| Open Schedule Format | Assets, sequences and shots for PlanCraft *(experimental)* |

The XLSX and ZIP writers are implemented from scratch rather than pulled in as
dependencies.

---

## Why a sidecar rather than tags inside the script

ScreenJSON already defines scene-level production tag arrays (`props`,
`wardrobe`, `sfx`, `vfx`, `sounds`, `animals`, `extra`, `locations`), so the
breakdown has a canonical home in the format. But those arrays are flat slug
lists: no character offsets, no quantities, no departments, no status. The schema
also sets `additionalProperties: false` at every level including the root, so
there is nowhere to add a richer structure.

BreakCraft therefore keeps its own versioned **breakdown sidecar** as the
authoritative record, and projects it into ScreenJSON on export — scene arrays
plus `note.highlight` ranges with colours, so the marked-up script renders in any
compliant viewer. The sidecar is what you re-import to continue working.

---

## Technology stack

* **React 19** with **Vite 8**, plain JSX
* **Vanilla CSS** with a shared design-token system — no utility framework
* **Two runtime dependencies beyond React: `pdf-lib`** for the direct PDF
  exports (script and breakdown sheets), using its built-in standard fonts so
  nothing is embedded, and **`react-joyride`** for the guided feature tour.
  Everything else — parsers, serializers, pagination, ZIP and XLSX writers —
  is first-party
* **`node --test`** for the deterministic core
* **oxlint**, deployed to **GitHub Pages** via Actions

---

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static output in dist/
npm run lint
npm test          # 87 tests: parsers, pagination, model, exports (including
                  # the pdf-lib-based script and breakdown-sheets PDFs), and a
                  # dev-only Ajv conformance check against the real
                  # ScreenJSON schema (vendor/screenjson-schema/)
```

Deployment sets `base` to `/BreakCraft/` for GitHub Pages. Override it for a
domain root:

```bash
BREAKCRAFT_BASE=/ npm run build
```


## Credits

Built on the [ScreenJSON](https://screenjson.com) screenplay schema. Designed to
sit alongside PlanCraft and PlumberManager, and shares their design system.

The five sample scripts in `public/samples/` are original screenplay
adaptations of stories in the public domain — Aesop's fables, Hans Christian
Andersen, and the Flora Annie Steel fairy tale collection (1918). No text is
copied from any edition; the scenes, action and dialogue were written fresh
for BreakCraft. Each ships as a blank script to tag yourself
(`*.fountain`/`*.fdx`) and a pre-tagged companion (`*.breakcraft.json`)
demonstrating the breakdown features — see
[`scripts/build-tagged-samples.mjs`](scripts/build-tagged-samples.mjs) for how
the latter is generated from the former.

🤖 The adaptations were drafted with Claude (Anthropic) as a writing assistant
and reviewed before inclusion.

## License

Licensed under the GNU General Public License v3.0.
