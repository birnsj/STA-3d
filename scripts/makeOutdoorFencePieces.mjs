// Outdoor fence Template Pieces — 64×32 run, 32×32 corner, 64-wide gate.
// Chunky post-and-rail (settlement fence look), timber boards — not wire-thin rails.
// Usage: node scripts/makeOutdoorFencePieces.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { paintPrismsAA } from './v2/templateDraw.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'public', 'art', 'sprites', 'environment', 'templates')
const cataloguePath = path.join(root, 'src', 'data', 'adaptation', 'maps', 'templatePieces.json')

const THICK = 32
const RUN = 64
const SEAM = 1
const HEIGHT = 20
/** Weathered wood — solid colour (not timber wall boards, which read as stacked blocks). */
const WOOD = '#b4aea2'
/** Post half-size in tip space (chunky square posts like the settlement fence tile). */
const POST = 3.6
/** Rail cross-section (vertical × depth). */
const RAIL_H = 2.6
const RAIL_D = 2.8
const RAIL_Z_LO = 5.5
const RAIL_Z_HI = 12

function box(x0, y0, x1, y1, z0, z1) {
  return { x0, y0, x1, y1, z0, z1 }
}

function postAt(x, yMid) {
  return box(x - POST, yMid - POST, x + POST, yMid + POST, 0, HEIGHT)
}

function rail(length, yMid, z0) {
  return box(-length - SEAM, yMid - RAIL_D / 2, SEAM, yMid + RAIL_D / 2, z0, z0 + RAIL_H)
}

/**
 * Straight fence: tip at (0,0), extends −X/−Y.
 * Three posts (both ends + mid) + two thick rails — same silhouette as the settlement fence tile.
 */
function fenceStraightPrisms(length = RUN) {
  const yMid = -POST - 0.5
  return [
    postAt(0, yMid),
    postAt(-length / 2, yMid),
    postAt(-length, yMid),
    rail(length, yMid, RAIL_Z_LO),
    rail(length, yMid, RAIL_Z_HI),
  ]
}

/** Corner / stub post — same thickness as run posts. */
function fenceCornerPrisms() {
  return [box(-POST * 2 - SEAM, -POST * 2 - SEAM, 0, 0, 0, HEIGHT)]
}

/**
 * Gate 64 wide: end posts + full rails + a center stile (farm-gate silhouette,
 * still reads open below the lower rail).
 */
function fenceGatePrisms(length = RUN) {
  const yMid = -POST - 0.5
  return [
    postAt(0, yMid),
    postAt(-length, yMid),
    postAt(-length / 2, yMid),
    rail(length, yMid, RAIL_Z_LO),
    rail(length, yMid, RAIL_Z_HI),
    // Short vertical stile between the rails (gate latch post).
    box(-length / 2 - 1.2, yMid - RAIL_D / 2, -length / 2 + 1.2, yMid + RAIL_D / 2, RAIL_Z_LO, RAIL_Z_HI + RAIL_H),
  ]
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
    return { x0, y0, x1, y1, z0: prism.z0, z1: prism.z1 }
  })
}

const pieces = []
const pngFiles = []

function add(id, label, tags, footprint, height, prisms) {
  const painted0 = paintPrismsAA(prisms, { colour: WOOD, yawTurns: 0, subsamples: 3 })
  const orients = {}
  pngFiles.push({ name: `${id}.png`, png: painted0.png })
  for (const turns of [1, 2, 3]) {
    const yaw = turns * 90
    const painted = paintPrismsAA(yawPrisms(prisms, turns), { colour: WOOD, yawTurns: turns, subsamples: 3 })
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
    layer: 'furniture',
    href: `/art/sprites/environment/templates/${id}.png`,
    size: { width: painted0.size.w, height: painted0.size.h },
    anchorX: painted0.size.anchorX,
    orients,
    tags,
    footprint: { width: footprint.w, depth: footprint.d },
    height,
    cover: true,
    fade: false,
    solid: true,
  })
}

add(
  'tplOutdoorFence64',
  'Fence 64',
  ['outdoor', 'fence', 'thick32', 'straight', 'furniture'],
  { w: RUN, d: THICK },
  HEIGHT,
  fenceStraightPrisms(RUN),
)
add(
  'tplOutdoorFence64Corner',
  'Fence Corner',
  ['outdoor', 'fence', 'thick32', 'corner', 'furniture'],
  { w: THICK, d: THICK },
  HEIGHT,
  fenceCornerPrisms(),
)
add(
  'tplOutdoorFenceGate64',
  'Fence Gate 64',
  ['outdoor', 'fence', 'thick32', 'doorway', 'gate', 'furniture'],
  { w: RUN, d: THICK },
  HEIGHT,
  fenceGatePrisms(RUN),
)

fs.mkdirSync(outDir, { recursive: true })
for (const name of fs.readdirSync(outDir)) {
  if (!name.endsWith('.png')) continue
  if (/^tplOutdoorFence(64|32|Corner|Gate)/.test(name)) fs.unlinkSync(path.join(outDir, name))
}
for (const { name, png } of pngFiles) {
  fs.writeFileSync(path.join(outDir, name), png)
}

const prior = fs.existsSync(cataloguePath) ? JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) : { pieces: [] }
const drop = new Set([
  ...pieces.map((entry) => entry.id),
  'tplOutdoorFence32',
  'tplOutdoorFence32Long',
  'tplOutdoorFence32Corner',
  'tplOutdoorFenceCorner',
])
const kept = (prior.pieces ?? []).filter((entry) => !drop.has(entry.id))
const notes = [...(prior.notes ?? [])].filter(
  (line) =>
    !String(line).includes('tplOutdoorFence32') &&
    !String(line).includes('tplOutdoorFenceCorner') &&
    !String(line).includes('tplOutdoorFence64') &&
    !String(line).includes('tplOutdoorFenceGate'),
)
notes.push(
  'Outdoor fence (tplOutdoorFence64 / Corner / Gate64): chunky timber post-and-rail 64×32 + corner post + 64 gate. Art via scripts/makeOutdoorFencePieces.mjs.',
)

fs.writeFileSync(cataloguePath, `${JSON.stringify({ notes, pieces: [...kept, ...pieces] }, null, 2)}\n`)
for (const entry of pieces) {
  console.log(`${entry.id} ${entry.size.width}×${entry.size.height} fp ${entry.footprint.width}×${entry.footprint.depth}`)
}
console.log(`Wrote ${pieces.length} fence pieces (${pngFiles.length} PNGs); kept ${kept.length} other catalogue entries`)
