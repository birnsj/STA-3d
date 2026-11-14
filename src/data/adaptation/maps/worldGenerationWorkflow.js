// World Generation Ruleset — Help topics + flowchart node copy.
// Edit this file to change Help menu text and flowchart descriptions.

export const WORLD_GENERATION_HELP_TOPICS = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'World Generation overview',
    body: [
      'This is the active map-construction path. Legacy Map Generator is locked (read-only; do not use it for new construction).',
      'One ruleset drives both Generate Map (full build) and Auto-Paint (paint floors; walls rebuild).',
      'Flowchart: click each step for a Corners-style visual assembly plus any settings. Pack pieces = tip lengths; Corners = junction/end-cap assembly.',
      'Below the flowchart: Floors / Walls / Doors role slots (Palette drag), then Adjacency (graphic neighbor pairs).',
      'Help menu opens this guide. Save the ruleset, then Generate or Rebuild to see packing + adjacency apply.',
    ],
  },
  {
    id: 'floors-walls',
    label: 'Floors → walls',
    title: 'Why walls hook to floors',
    body: [
      '1. Floor role pieces define which cells count as floor.',
      '2. Find edges (flowchart): empty (Null) cells next to any floor become wall candidates (optional claim toggle).',
      '3. Those cells become invisible wall underlay (templateWall).',
      '4. The floor art is stored under the wall (floorUnder) so deck still shows through.',
      '5. Pack pieces + Corners: Straight / long / corner from the Walls slots (and the visual assembly) are packed onto that underlay.',
      'So walls grow around the floor footprint — they are not a separate freehand layer in Generate.',
    ],
  },
  {
    id: 'roles',
    label: 'Role slots',
    title: 'Floors, walls, and doors slots',
    body: [
      'Drag from the left Palette (same Template Pieces catalogue as Dev Edit Assets). Show all also offers Starship full-cell wall tiles.',
      'Floors (required): floor pieces; several allowed with mix %.',
      'Straight + Corner (required): 64-long runs and 32×32 posts / end caps / junction posts.',
      'Straight long (optional): 128-long runs when a stretch is long enough.',
      'Hull / Door frame (optional): empty means rim uses straight/corner; openings stay underlay-only unless framed.',
      'Doorway slot: art for openings; Generate also lines Doorway 32 tips on the gap (see Doorways flowchart step).',
      'You can also set Straight / Long / Corner by dropping onto the Corners visual assembly diagrams.',
      'Hover a thumb for footprint size (not the tile sprite box). Right-click a role thumb to remove.',
    ],
  },
  {
    id: 'packing',
    label: 'Packing',
    title: '128 → 64 → 32 packing',
    body: [
      'On each wall run, packing prefers long pieces, then short, then 32 stubs (corner length).',
      'Pack pieces flowchart step: edit tip lengths in px (defaults long 128, short 64, stub 32). Tip grid stays 32px (Template Piece size).',
      'Doorways step: 96px = 3× Doorway 32 on a 2-cell gap (defaults); leftover tip stays empty for jamb Corner end caps — not a Corner inside the opening.',
      'After lengths are set, open the Corners step for the visual assembly of how those pieces sit on a run, an L, and a free end.',
    ],
  },
  {
    id: 'corners',
    label: 'Corners assembly',
    title: 'Visual packing assembly (Corners)',
    body: [
      'Click Flowchart → Corners. Three diagrams use your current Walls primary thumbnails:',
      'Straight run — end cap · long · short · end cap.',
      'L junction — −Y / −X arms, half-cell fills, SE corner post (how a turn is finished).',
      'Free end / doorway jamb — short → end cap.',
      'Drop from the Palette onto a diagram slot to set that Walls role (same resolve as role slots below).',
      'Click a corner post, fill, or end-cap thumb to turn that packing step on or off (dims when off): junction posts, arm fills, free-end caps.',
      'Checkbox on the L diagram: trim the straight-run tip where a junction fill already covers that half-cell.',
      'These flags save on the ruleset pipeline. Role art still appears in Floors / Walls / Doors slots; assembly and slots stay in sync.',
    ],
  },
  {
    id: 'adjacency',
    label: 'Adjacency',
    title: 'Wall–wall and wall–floor rules',
    body: [
      'Adjacency is a graphic pair editor below the role slots (not dropdowns).',
      'Wall ↔ wall: which wall pieces may neighbor each other along a run or at a join.',
      'Wall ↔ floor: which wall pieces may sit beside which floor pieces.',
      'Empty list = allow all. Once you add pairs, only those pairs are allowed (whitelist).',
      'Drag from the Palette onto the two empty sides of a draft pair. When both sides have a piece, the pair is committed as two thumbnails with “next to” between them.',
      'Prefer pieces already in Floors / Walls slots. Right-click a committed thumb or use Remove to delete a pair.',
      'Save, then Generate or Rebuild — packing only picks whitelist-allowed neighbors when lists are non-empty.',
    ],
  },
  {
    id: 'generate-vs-paint',
    label: 'Generate vs Auto-Paint',
    title: 'Generate Map vs Auto-Paint',
    body: [
      'Generate Map (in this screen): builds a room grid of floors, cuts openings, then runs the wall pipeline (packing + corners + adjacency). Each press uses a new seed.',
      'After Generate, use Rules / Map toggles — Map shows the result; left Palette stays.',
      'Auto-Paint (Edit menu on the main map): you paint floors; Rebuild / live paint runs the same wall pipeline on the current footprint.',
      'Same ruleset, same flowchart and adjacency — different starting point (full layout vs your floors).',
    ],
  },
]

/** Flowchart nodes (order = left-to-right). settingsKey maps to ruleset.pipeline fields. */
export const WORLD_GENERATION_FLOW_NODES = [
  {
    id: 'floors',
    label: 'Floors',
    summary: 'Role slots define floor cells',
    helpTopicId: 'floors-walls',
    settings: [],
  },
  {
    id: 'exterior',
    label: 'Find edges',
    summary: 'Empty cells next to floors → wall underlay',
    helpTopicId: 'floors-walls',
    settings: [
      {
        key: 'claimExteriorNull',
        type: 'boolean',
        label: 'Claim Null cells next to floors as walls',
      },
    ],
  },
  {
    id: 'underlay',
    label: 'Underlay + floorUnder',
    summary: 'Invisible wall cells; floor shows underneath',
    helpTopicId: 'floors-walls',
    settings: [],
  },
  {
    id: 'packing',
    label: 'Pack pieces',
    summary: 'Long → short → stub on underlay runs',
    helpTopicId: 'packing',
    settings: [
      { key: 'packLong', type: 'number', label: 'Long tip length (px)', min: 64, max: 256, step: 32 },
      { key: 'packShort', type: 'number', label: 'Short tip length (px)', min: 32, max: 128, step: 32 },
      { key: 'packStub', type: 'number', label: 'Stub / corner tip length (px)', min: 32, max: 64, step: 32 },
    ],
  },
  {
    id: 'doorways',
    label: 'Doorways',
    summary: 'Floor gaps + Doorway 32 lining',
    helpTopicId: 'roles',
    settings: [
      {
        key: 'doorCells',
        type: 'number',
        label: 'Opening width (underlay cells)',
        min: 1,
        max: 4,
        step: 1,
      },
      {
        key: 'doorTipUnits',
        type: 'number',
        label: 'Doorway tip units (×32px)',
        min: 1,
        max: 6,
        step: 1,
      },
      { key: 'preferOpenings', type: 'boolean', label: 'Prefer openings when generating', path: 'doors.preferOpenings' },
      { key: 'minGap', type: 'number', label: 'Min gap between openings', min: 1, max: 8, step: 1, path: 'doors.minGap' },
    ],
    // Hint under the Doorways settings (paired: cells ↔ tip units).
    settingsHint:
      'Default 2 cells + 3 tip units = 96px of Doorway 32 on a 128px gap; the jamb Corner fills the leftover tip. Changing either number updates the other.',
  },
  {
    id: 'endCaps',
    label: 'Corners',
    summary: 'Visual assembly — how pieces fit together',
    helpTopicId: 'corners',
    // Visual UI is WorldGenerationPackingAssembly (every flowchart node has a diagram).
    settings: [],
  },
]

export const WORLD_GENERATION_PIPELINE_DEFAULTS = Object.freeze({
  claimExteriorNull: true,
  packLong: 128,
  packShort: 64,
  packStub: 32,
  doorCells: 2,
  doorTipUnits: 3,
  placeJunctionCorners: true,
  junctionArmFills: true,
  trimRunAtJunction: true,
  cornerEndCaps: true,
})
