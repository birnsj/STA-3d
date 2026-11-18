// Bridge Template — original TOS-bridge Template Pieces (not Starship/Outdoor copies).
// Faces: tosStation / tosViewscreen / tosTurbolift / tosHull. Floors & props: tosDeck / tosWell / tosChair / tosConsole*.
// Palette group: Bridge Template (tag `bridge`). World Gen ruleset id: bridge-template.
// Usage: node scripts/makeBridgeTemplatePieces.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paintPrismsAA } from './v2/templateDraw.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'art', 'sprites', 'environment', 'templates')
const cataloguePath = path.join(root, 'src', 'data', 'adaptation', 'maps', 'templatePieces.json')

const THICK = 32
const RUN = 64
const RUN_LONG = 128
const CONCAVE = 128
const SEAM = 1
const HEIGHT_IN = 92
const HEIGHT_OUT = 88
const FLOOR_H = 4

function box(x0, y0, x1, y1, z0, z1) {
  return { x0, y0, x1, y1, z0, z1 }
}

function tipNormalize(prisms) {
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of prisms) {
    maxX = Math.max(maxX, p.x0, p.x1)
    maxY = Math.max(maxY, p.y0, p.y1)
  }
  return prisms.map((p) => ({
    ...p,
    x0: p.x0 - maxX,
    y0: p.y0 - maxY,
    x1: p.x1 - maxX,
    y1: p.y1 - maxY,
  }))
}

function withMaterial(prisms, material) {
  return prisms.map((p) => ({ ...p, material }))
}

function straightPrisms(length, thick, height) {
  return [box(-length - SEAM, -thick, 0, 0, 0, height)]
}

function cornerPostPrisms(thick, height) {
  return [box(-thick - SEAM, -thick - SEAM, 0, 0, 0, height)]
}

function concaveCornerPrisms(run, thick, height) {
  return [
    box(-run - SEAM, -thick, 0, 0, 0, height),
    box(-thick, -run - SEAM, 0, 0, 0, height),
  ]
}

function teePrisms(run, thick, height) {
  const half = thick / 2
  return tipNormalize([
    box(-run - SEAM, -half, 0, half, 0, height),
    box(-half, -run - SEAM, half, -half, 0, height),
  ])
}

function crossPrisms(run, thick, height) {
  const half = thick / 2
  const arm = run / 2
  return tipNormalize([
    box(-half, -arm - SEAM, half, arm + SEAM, 0, height),
    box(-arm - SEAM, -half, arm + SEAM, half, 0, height),
  ])
}

function alcovePrisms(run, thick, depth, height) {
  return tipNormalize([
    box(-run - SEAM, -thick, 0, 0, 0, height),
    box(-run - SEAM, -depth - SEAM, -run + thick, -thick, 0, height),
    box(-thick, -depth - SEAM, 0, -thick, 0, height),
  ])
}

function doorFramePrisms(run, thick, height, opening = 40) {
  const post = (run - opening) / 2
  const lintelZ = height - 28
  return [
    box(-run - SEAM, -thick, -run + post, 0, 0, height),
    box(-post - SEAM, -thick, 0, 0, 0, height),
    box(-run - SEAM, -thick, 0, 0, lintelZ, height),
  ]
}

function slabPrisms(w, d, height) {
  return [box(-w, -d, 0, 0, 0, height)]
}

function chairPrisms() {
  return tipNormalize([
    { ...box(-5, -5, 5, 5, 0, 8), colour: '#1a1a1e' },
    ...withMaterial([box(-10, -10, 10, 10, 8, 11)], 'tosSeatPad'),
    ...withMaterial(
      [
        box(-12, -14, 12, -6, 8, 26),
        box(-12, -10, -8, 8, 10, 20),
        box(8, -10, 12, 8, 10, 20),
      ],
      'tosChair',
    ),
  ])
}

function captainsChairPrisms() {
  return tipNormalize([
    { ...box(-14, -12, 14, 14, 0, 3), colour: '#4a4a52' },
    { ...box(-6, -4, 6, 8, 3, 10), colour: '#8a8c92' },
    ...withMaterial(
      [
        box(-18, -8, 18, 18, 10, 15),
        box(-18, -28, 18, -6, 10, 40),
        box(-12, -32, 12, -26, 32, 38),
      ],
      'tosChair',
    ),
    { ...box(-22, -6, -16, 10, 13, 17), colour: '#a8a8b0' },
    { ...box(16, -6, 22, 10, 13, 17), colour: '#a8a8b0' },
  ])
}

function consolePrisms({ wide = false, hood = false } = {}) {
  const half = wide ? 40 : 24
  const parts = [
    ...withMaterial(
      [
        box(-half, 0, half, 24, 0, 12),
        box(-half - 4, -4, half + 4, 26, 12, 16),
      ],
      'tosConsole',
    ),
    // Bright red face toward the room (near +y lip of the desk).
    ...withMaterial([box(-half + 2, 22, half - 2, 26, 2, 12)], 'tosConsoleRed'),
    ...withMaterial([box(-half + 6, -14, half - 6, -8, 14, 34)], 'tosConsoleScreen'),
  ]
  if (hood) {
    parts.push(...withMaterial([box(-12, -18, 12, -12, 28, 42), box(-14, -20, 14, -10, 40, 44)], 'tosConsole'))
  }
  return tipNormalize(parts)
}

function viewscreenPrisms() {
  return tipNormalize([
    ...withMaterial([box(-56, -4, 56, 12, 0, 12)], 'tosConsole'),
    ...withMaterial([box(-52, -8, 52, 0, 10, 72)], 'tosConsoleScreen'),
    ...withMaterial([box(-56, -10, -50, 4, 8, 74), box(50, -10, 56, 4, 8, 74)], 'tosConsole'),
  ])
}

function railPrisms(length = 64) {
  return tipNormalize([
    { ...box(-length / 2, -3, length / 2, 3, 0, 7), colour: '#2a2a30' },
    { ...box(-length / 2 + 6, -1.5, -length / 2 + 10, 1.5, 7, 12), colour: '#1a1a1e' },
    { ...box(length / 2 - 10, -1.5, length / 2 - 6, 1.5, 7, 12), colour: '#1a1a1e' },
    ...withMaterial([box(-length / 2 + 2, -2.5, length / 2 - 2, 2.5, 11, 16)], 'tosRail'),
  ])
}

function yawPoint(x, y, turns) {
  let dx = x
  let dy = y
  const n = ((turns % 4) + 4) % 4
  for (let i = 0; i < n; i++) {
    const nextX = -dy
    const nextY = dx
    dx = nextX
    dy = nextY
  }
  return [dx, dy]
}

function yawPrisms(prisms, turns) {
  if (!turns) return prisms
  return prisms.map((prism) => {
    const [x0, y0] = yawPoint(prism.x0, prism.y0, turns)
    const [x1, y1] = yawPoint(prism.x1, prism.y1, turns)
    return { ...prism, x0, y0, x1, y1 }
  })
}

const pieces = []
const pngFiles = []
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').filter(Boolean)) : null

function add(id, label, tags, footprint, height, prisms, { face = null, material = null, layer = 'walls', cover = false, fade = true } = {}) {
  if (ONLY && !ONLY.has(id) && ![...ONLY].some((key) => id.includes(key))) return
  const painted0 = paintPrismsAA(prisms, { face, material, yawTurns: 0 })
  const orients = {}
  pngFiles.push({ name: `${id}.png`, png: painted0.png })
  for (const turns of [1, 2, 3]) {
    const yaw = turns * 90
    const painted = paintPrismsAA(yawPrisms(prisms, turns), { face, material, yawTurns: turns })
    const name = `${id}_r${yaw}.png`
    pngFiles.push({ name, png: painted.png })
    orients[String(yaw)] = {
      href: `/art/sprites/environment/templates/${name}`,
      size: { width: painted.size.w, height: painted.size.h },
      anchorX: painted.size.anchorX,
    }
  }
  pieces.push({
    id,
    label,
    layer,
    href: `/art/sprites/environment/templates/${id}.png`,
    size: { width: painted0.size.w, height: painted0.size.h },
    anchorX: painted0.size.anchorX,
    orients,
    tags,
    footprint: { width: footprint.w, depth: footprint.d },
    height,
    cover,
    fade,
    ...(face ? { face } : {}),
  })
}

function addWallKit(prefix, labelPrefix, face, height, placeTag, { includeExtras = true } = {}) {
  const base = ['wall', 'bridge', 'thick32', placeTag, face]
  add(`${prefix}Wall32`, `${labelPrefix} Wall 32`, [...base, 'straight'], { w: RUN, d: THICK }, height, straightPrisms(RUN, THICK, height), { face })
  add(
    `${prefix}Wall32Long`,
    `${labelPrefix} Wall (Long) 32`,
    [...base, 'straight', 'long'],
    { w: RUN_LONG, d: THICK },
    height,
    straightPrisms(RUN_LONG, THICK, height),
    { face },
  )
  add(
    `${prefix}Wall32Corner`,
    `${labelPrefix} Corner Post 32`,
    [...base, 'corner'],
    { w: THICK, d: THICK },
    height,
    cornerPostPrisms(THICK, height),
    { face },
  )
  if (!includeExtras) return
  add(
    `${prefix}Wall32Concave`,
    `${labelPrefix} Concave Corner 128`,
    [...base, 'corner', 'concave'],
    { w: CONCAVE, d: CONCAVE },
    height,
    concaveCornerPrisms(CONCAVE, THICK, height),
    { face },
  )
  add(`${prefix}Wall32Tee`, `${labelPrefix} Tee 32`, [...base, 'tee'], { w: RUN, d: RUN }, height, teePrisms(RUN, THICK, height), { face })
  add(`${prefix}Wall32Cross`, `${labelPrefix} Cross 32`, [...base, 'cross'], { w: RUN, d: RUN }, height, crossPrisms(RUN, THICK, height), { face })
  add(
    `${prefix}Wall32Alcove`,
    `${labelPrefix} Alcove 32`,
    [...base, 'alcove'],
    { w: 48, d: 40 },
    height,
    alcovePrisms(48, THICK, 40, height),
    { face },
  )
  add(
    `${prefix}Wall32Door`,
    `${labelPrefix} Door Frame 32`,
    [...base, 'door'],
    { w: RUN, d: THICK },
    height,
    doorFramePrisms(RUN, THICK, height),
    { face },
  )
}

addWallKit('tplBridgeIndoor', 'TOS Station', 'tosStation', HEIGHT_IN, 'indoor')
addWallKit('tplBridgeOutdoor', 'TOS Hull', 'tosHull', HEIGHT_OUT, 'outdoorHull')
addWallKit('tplBridgeHullWindow', 'TOS Hull Viewport', 'tosHullWindow', HEIGHT_OUT, 'outdoorHull', { includeExtras: false })
add(
  'tplBridgeHullWindowWall32Concave',
  'TOS Hull Viewport Concave 128',
  ['wall', 'bridge', 'thick32', 'outdoorHull', 'tosHullWindow', 'corner', 'concave'],
  { w: CONCAVE, d: CONCAVE },
  HEIGHT_OUT,
  concaveCornerPrisms(CONCAVE, THICK, HEIGHT_OUT),
  { face: 'tosHullWindow' },
)
addWallKit('tplBridgeHullBay', 'TOS Hull Bay', 'tosHullBay', HEIGHT_OUT, 'outdoorHull', { includeExtras: false })
addWallKit('tplBridgeViewscreen', 'TOS Viewscreen', 'tosViewscreen', HEIGHT_IN, 'indoor', { includeExtras: false })
add(
  'tplBridgeViewscreenWall32Concave',
  'TOS Viewscreen Concave 128',
  ['wall', 'bridge', 'thick32', 'indoor', 'tosViewscreen', 'corner', 'concave'],
  { w: CONCAVE, d: CONCAVE },
  HEIGHT_IN,
  concaveCornerPrisms(CONCAVE, THICK, HEIGHT_IN),
  { face: 'tosViewscreen' },
)
addWallKit('tplBridgeTurbolift', 'TOS Turbolift', 'tosTurbolift', HEIGHT_IN, 'indoor', { includeExtras: false })

add('tplBridgeFloor', 'TOS Deck', ['floor', 'bridge', 'floor'], { w: RUN, d: RUN }, FLOOR_H, slabPrisms(RUN, RUN, FLOOR_H), {
  material: 'tosDeck',
  layer: 'ground',
  fade: false,
})
add('tplBridgeFloor128', 'TOS Deck 128', ['floor', 'bridge', 'floor'], { w: RUN_LONG, d: RUN_LONG }, FLOOR_H, slabPrisms(RUN_LONG, RUN_LONG, FLOOR_H), {
  material: 'tosDeck',
  layer: 'ground',
  fade: false,
})
add('tplBridgeFloor32', 'TOS Deck 32', ['floor', 'bridge', 'floor'], { w: THICK, d: THICK }, FLOOR_H, slabPrisms(THICK, THICK, FLOOR_H), {
  material: 'tosDeck',
  layer: 'ground',
  fade: false,
})
add('tplBridgeWell', 'TOS Command Well', ['floor', 'bridge', 'floor', 'carpet'], { w: RUN, d: RUN }, FLOOR_H, slabPrisms(RUN, RUN, FLOOR_H), {
  material: 'tosWell',
  layer: 'ground',
  fade: false,
})
add('tplBridgeWell32', 'TOS Command Well 32', ['floor', 'bridge', 'floor', 'carpet'], { w: THICK, d: THICK }, FLOOR_H, slabPrisms(THICK, THICK, FLOOR_H), {
  material: 'tosWell',
  layer: 'ground',
  fade: false,
})
add('tplBridgeWell128', 'TOS Command Well 128', ['floor', 'bridge', 'floor', 'carpet'], { w: RUN_LONG, d: RUN_LONG }, FLOOR_H, slabPrisms(RUN_LONG, RUN_LONG, FLOOR_H), {
  material: 'tosWell',
  layer: 'ground',
  fade: false,
})
add('tplBridgeHullPlate', 'TOS Hull Plating', ['floor', 'bridge', 'floor', 'outdoorHull'], { w: RUN, d: RUN }, FLOOR_H, slabPrisms(RUN, RUN, FLOOR_H), {
  material: 'tosHullPlate',
  layer: 'ground',
  fade: false,
})
add('tplBridgeHullPlate32', 'TOS Hull Plating 32', ['floor', 'bridge', 'floor', 'outdoorHull'], { w: THICK, d: THICK }, FLOOR_H, slabPrisms(THICK, THICK, FLOOR_H), {
  material: 'tosHullPlate',
  layer: 'ground',
  fade: false,
})

add(
  'tplBridgePillar',
  'TOS Station Pillar',
  ['wall', 'bridge', 'pillar', 'indoor', 'tosStation'],
  { w: THICK, d: THICK },
  HEIGHT_IN,
  cornerPostPrisms(THICK, HEIGHT_IN),
  { face: 'tosStation' },
)
add(
  'tplBridgeHullPillar',
  'TOS Hull Pillar',
  ['wall', 'bridge', 'pillar', 'outdoorHull', 'tosHull'],
  { w: THICK, d: THICK },
  HEIGHT_OUT,
  cornerPostPrisms(THICK, HEIGHT_OUT),
  { face: 'tosHull' },
)

add('tplBridgeCaptainsChair', "TOS Captain's Chair", ['prop', 'bridge', 'furniture', 'chair'], { w: 44, d: 54 }, 16, captainsChairPrisms(), {
  material: 'tosChair',
  layer: 'props',
  fade: false,
})
add('tplBridgeCrewChair', 'TOS Crew Chair', ['prop', 'bridge', 'furniture', 'chair'], { w: 36, d: 42 }, 12, chairPrisms(), {
  material: 'tosChair',
  layer: 'props',
  fade: false,
})
add('tplBridgeHelmConsole', 'TOS Helm Console', ['prop', 'bridge', 'furniture', 'console'], { w: 60, d: 50 }, 18, consolePrisms(), {
  material: 'tosConsole',
  layer: 'props',
  fade: false,
})
add('tplBridgeHelmWide', 'TOS Helm / Nav Console', ['prop', 'bridge', 'furniture', 'console'], { w: 96, d: 50 }, 18, consolePrisms({ wide: true }), {
  material: 'tosConsole',
  layer: 'props',
  fade: false,
})
add('tplBridgeTacticalConsole', 'TOS Tactical Console', ['prop', 'bridge', 'furniture', 'console'], { w: 60, d: 50 }, 18, consolePrisms(), {
  material: 'tosConsole',
  layer: 'props',
  fade: false,
})
add('tplBridgeScienceConsole', 'TOS Science Console', ['prop', 'bridge', 'furniture', 'console'], { w: 96, d: 50 }, 18, consolePrisms({ wide: true, hood: true }), {
  material: 'tosConsole',
  layer: 'props',
  fade: false,
})
add('tplBridgeCommsConsole', 'TOS Communications Console', ['prop', 'bridge', 'furniture', 'console'], { w: 60, d: 50 }, 18, consolePrisms(), {
  material: 'tosConsole',
  layer: 'props',
  fade: false,
})
add('tplBridgeEngineeringConsole', 'TOS Engineering Console', ['prop', 'bridge', 'furniture', 'console'], { w: 96, d: 50 }, 18, consolePrisms({ wide: true }), {
  material: 'tosConsole',
  layer: 'props',
  fade: false,
})
add('tplBridgeViewscreen', 'TOS Main Viewscreen', ['prop', 'bridge', 'furniture', 'console', 'viewscreen'], { w: 112, d: 30 }, 40, viewscreenPrisms(), {
  material: 'tosConsole',
  layer: 'props',
  fade: false,
})
add('tplBridgeRail', 'TOS Bridge Rail', ['prop', 'bridge', 'furniture', 'rail'], { w: RUN, d: 12 }, 10, railPrisms(RUN), {
  material: 'tosRail',
  layer: 'props',
  fade: false,
})
add('tplBridgeRailLong', 'TOS Bridge Rail Long', ['prop', 'bridge', 'furniture', 'rail'], { w: RUN_LONG, d: 12 }, 10, railPrisms(RUN_LONG), {
  material: 'tosRail',
  layer: 'props',
  fade: false,
})
add('tplBridgeRailCorner', 'TOS Bridge Rail Corner', ['prop', 'bridge', 'furniture', 'rail'], { w: 40, d: 40 }, 10, tipNormalize([
  { ...box(-36, -3, 0, 3, 0, 7), colour: '#2a2a30' },
  { ...box(-3, -36, 3, 0, 0, 7), colour: '#2a2a30' },
  ...withMaterial([box(-34, -2.5, -2, 2.5, 11, 16), box(-2.5, -34, 2.5, -2, 11, 16)], 'tosRail'),
]), {
  material: 'tosRail',
  layer: 'props',
  fade: false,
})
add('tplBridgeTurboliftDoor', 'TOS Turbolift Door', ['wall', 'bridge', 'door', 'indoor', 'tosTurbolift'], { w: RUN, d: THICK }, HEIGHT_IN, doorFramePrisms(RUN, THICK, HEIGHT_IN, 36), {
  face: 'tosTurbolift',
  fade: true,
})

fs.mkdirSync(outDir, { recursive: true })
if (!ONLY) {
  for (const name of fs.readdirSync(outDir)) {
    if (!name.endsWith('.png')) continue
    if (/^tplBridge/.test(name)) fs.unlinkSync(path.join(outDir, name))
  }
}
for (const { name, png } of pngFiles) {
  fs.writeFileSync(path.join(outDir, name), png)
}

const prior = fs.existsSync(cataloguePath) ? JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) : { pieces: [] }
const REPLACE_IDS = new Set(pieces.map((entry) => entry.id))
const RETIRED = ONLY
  ? new Set()
  : new Set(
      (prior.pieces ?? [])
        .filter((entry) => String(entry.id || '').startsWith('tplBridge') && !REPLACE_IDS.has(entry.id))
        .map((entry) => entry.id),
    )
const kept = (prior.pieces ?? []).filter((entry) => !REPLACE_IDS.has(entry.id) && !RETIRED.has(entry.id))
const notes = [...(prior.notes ?? [])].filter((line) => !String(line).includes('tplBridge*'))
notes.push(
  'Bridge Template (tplBridge*): original TOS faces (tosStation / tosViewscreen / tosTurbolift / tosHull) and prop materials — not Starship Template copies. Art via scripts/makeBridgeTemplatePieces.mjs. World Gen ruleset bridge-template. Palette group Bridge Template (tag bridge).',
)

fs.writeFileSync(cataloguePath, `${JSON.stringify({ notes, pieces: [...kept, ...pieces] }, null, 2)}\n`)
for (const entry of pieces) {
  console.log(`${entry.id} ${entry.size.width}×${entry.size.height} fp ${entry.footprint.width}×${entry.footprint.depth}`)
}
console.log(`Wrote ${pieces.length} bridge pieces (${pngFiles.length} PNGs); kept ${kept.length} other catalogue entries`)
