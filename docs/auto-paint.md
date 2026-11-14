# Auto-Paint

**New map-construction path** (fully separate from **Legacy Map Generator** / `generators/*` — no shared generator code). Two separate functions share the same rulesets:

- **Generate New Map** — builds a full floor plan + walls from the ruleset.
- **Auto-Paint** — paint floors by hand; walls rebuild from the footprint (also Rebuild Auto-Paint Walls).

Editor overview / menu placement: `docs/editor-authoring-summary.md` (§8 World Generation Ruleset; Tools File menus).

## Current behaviour

1. **Tools → World Generation Ruleset** — palette is the Dev Edit **Template Pieces** catalogue (`templatePieces.json`). **Help** menu + **Flowchart** (pipeline settings) + role slots + **Adjacency rules** (per-ruleset wall↔wall and wall↔floor whitelists; empty = allow all). Edit Help copy in `src/data/adaptation/maps/worldGenerationWorkflow.js`. Pipeline / adjacency save on the ruleset. Default ruleset **Template 32** stores **Template Piece ids** in wall roles. Save → `autoPaintRulesets.json` (`/__autopaint`).
2. **Generate New Map** (in World Generation Ruleset) — builds into the open map and shows it in **Map** view (left palette stays; **Rules** / **Map** toggles). Grid settings are shared with main Dev Edit. Template 32: deck room grid + `templateWall` underlay + **96-wide** openings (two floor cells; **3× Doorway 32** + Corner 32 leftover) + wall runs with **Corner 32 end caps** on every free edge + floorUnder + **128 / 64 / 32** packing (`placeWallRuns.js`). Does not call frozen `placeTemplateWalls`.
3. **Edit → Toggle Auto-Paint** — paint floors; walls rebuild from the footprint.
4. **Edit → Rebuild Auto-Paint Walls** — regenerate auto walls from current floors.

Bulkhead-style rulesets: assign full-cell tiles (`bulkhead`, …) into Straight / Corner — tile assembly path (`wallsTiles.js`).

Manual Auto-Paint wall cells can be promoted so Rebuild leaves them alone. Erasing suppresses that cell.

## Packing

| Role | Tip length |
| --- | --- |
| Straight long | 128 |
| Straight | 64 |
| Corner / stub | 32×32 |

Hull / doorFrame **null** → no Template Deck fill-in (rim uses straight/corner; doorways stay underlay-only). Packing tracks **underlay-cell coverage** and tip-grid edge continuity: junction corner posts sit on the SE tip; −X/−Y arms leave a half-cell gap that a south-edge tip `(x+0.5,y+1)` / east-edge tip `(x+1,y+0.5)` fill closes. **Free run ends** (door jambs, open edges) also get **Bulkhead Corner 32** end caps so every wall edge has the same finished post detail — never a flat cut straight. Never reuse `tipAlongX/Y` at junctions (collides with the corner tip).

## Collision

`templateWall` underlay is **not** full-cell solid for movement. Bodies collide with Template Piece **footprints** (32-thick edge strips) via `circleHitsTemplateWalls` / exploration `isClear`. Sight still uses full-cell `blocksSight` on the underlay. Combat steps also reject paths that cross a piece strip (`isClearLine`).

## Floor under walls

Underlay wall cells store the ruleset default floor in `floorUnder`. Empty `templateWall` cells paint that floor on the board (walls stay Template Piece overlays). Combat’s `toBattleMap` keeps `floorUnder` + placements so the battlefield matches exploration.

## Map JSON

Optional `autoPaint` block (`rulesetId`, regions with floor / underlay / piece / suppressed keys).

## Doorways

Openings are **96px** (three Doorway 32 tips) on a **two-cell** floor gap — no full-cell `doorway` tile and no Floor 32 overlay (underlay is already deck). Generate keeps the frozen deck’s two-tile cuts (trims longer runs to two cells), paints them as floor, then packs **3× Doorway 32** on the wall strip and a **Corner 32** on any leftover tip; wall runs at the jambs also get Corner 32 end caps. Keys live in `autoPaint.regions[].generatedDoorKeys`. Optional `walls.doorFrame` still places a frame piece when set.

## Not yet

Props / furnishings, Auto-Paint-native layouts beyond the shared deck grid.

## Frozen / locked

Legacy Map Generator (Tools → Legacy Map Generator) is **read-only**. Location generators live in `src/maps/generators/*` and `templateDeckStyle` — do not edit them for World Generation work. Generate New Map uses `src/maps/autoPaint/deckLayout.js` (owned copy of the old deck room grid).
