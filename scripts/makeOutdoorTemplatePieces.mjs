// Outdoor Template 32 — 32-thick wall kit (straight / long / corner) for outdoor locations.
// Same packing geometry as Starship Template 32; outdoor builtWall faces (prefab / barn / city / timber / stone / ruin).
// Keeps existing outdoor floor/prop Template Pieces (tile-art overlays). Does not touch Starship or Dimension.
// Usage: node scripts/makeOutdoorTemplatePieces.mjs
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
const SEAM = 1

function box(x0, y0, x1, y1, z0, z1) {
  return { x0, y0, x1, y1, z0, z1 }
}

function straightPrisms(length, thick, height) {
  return [box(-length - SEAM, -thick, 0, 0, 0, height)]
}

function cornerPostPrisms(thick, height) {
  return [box(-thick - SEAM, -thick - SEAM, 0, 0, 0, height)]
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

const STYLES = [
  { id: 'Prefab', label: 'Prefab', face: 'prefab', height: 80 },
  { id: 'Barn', label: 'Barn', face: 'barn', height: 92 },
  { id: 'City', label: 'Building', face: 'city', height: 88 },
  { id: 'Timber', label: 'Timber', face: 'timber', height: 80 },
  { id: 'Stone', label: 'Dry-Stone', face: 'stone', height: 68 },
  { id: 'Ruin', label: 'Ruined', face: 'ruin', height: 52 },
]

const pieces = []
const pngFiles = []

function add(id, label, tags, footprint, height, prisms, face) {
  const painted0 = paintPrismsAA(prisms, { face, yawTurns: 0 })
  const orients = {}
  pngFiles.push({ name: `${id}.png`, png: painted0.png })
  for (const turns of [1, 2, 3]) {
    const yaw = turns * 90
    const painted = paintPrismsAA(yawPrisms(prisms, turns), { face, yawTurns: turns })
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
    layer: 'walls',
    href: `/art/sprites/environment/templates/${id}.png`,
    size: { width: painted0.size.w, height: painted0.size.h },
    anchorX: painted0.size.anchorX,
    orients,
    tags,
    footprint: { width: footprint.w, depth: footprint.d },
    height,
    cover: face === 'ruin',
    fade: true,
    face,
  })
}

for (const style of STYLES) {
  const baseTags = ['wall', 'outdoor', 'thick32', style.face]
  add(
    `tplOutdoor${style.id}Wall32`,
    `${style.label} Wall 32`,
    [...baseTags, 'straight'],
    { w: RUN, d: THICK },
    style.height,
    straightPrisms(RUN, THICK, style.height),
    style.face,
  )
  add(
    `tplOutdoor${style.id}Wall32Long`,
    `${style.label} Wall (Long) 32`,
    [...baseTags, 'straight', 'long'],
    { w: RUN_LONG, d: THICK },
    style.height,
    straightPrisms(RUN_LONG, THICK, style.height),
    style.face,
  )
  add(
    `tplOutdoor${style.id}Wall32Corner`,
    `${style.label} Corner 32`,
    [...baseTags, 'corner'],
    { w: THICK, d: THICK },
    style.height,
    cornerPostPrisms(THICK, style.height),
    style.face,
  )
}

fs.mkdirSync(outDir, { recursive: true })
// Clear only outdoor wall kit PNGs (not starship / dim / outdoor floor-prop tile overlays).
for (const name of fs.readdirSync(outDir)) {
  if (!name.endsWith('.png')) continue
  if (/^tplOutdoor(Prefab|Barn|City|Timber|Stone|Ruin)Wall32/.test(name)) {
    fs.unlinkSync(path.join(outDir, name))
  }
}
for (const { name, png } of pngFiles) {
  fs.writeFileSync(path.join(outDir, name), png)
}

const prior = fs.existsSync(cataloguePath) ? JSON.parse(fs.readFileSync(cataloguePath, 'utf8')) : { pieces: [] }
const REPLACE_WALL_IDS = new Set([
  'tplOutdoorPrefabWall',
  'tplOutdoorBarnWall',
  'tplOutdoorCityWall',
  'tplOutdoorTimberWall',
  'tplOutdoorStoneWall',
  'tplOutdoorRuinWall',
  'tplOutdoorCampBarricade',
  ...pieces.map((entry) => entry.id),
])
const kept = (prior.pieces ?? []).filter((entry) => !REPLACE_WALL_IDS.has(entry.id))
const notes = [...(prior.notes ?? [])]
const outdoorNote =
  'Outdoor Template 32 walls (tplOutdoor*Wall32*): 32 thick (64 / 128 run); corner post 32×32. Faces match outdoor builtWall tiles (prefab / barn / city / timber / stone / ruin). Art via scripts/makeOutdoorTemplatePieces.mjs. Floors/props remain tile-art overlays.'
if (!notes.some((line) => String(line).includes('tplOutdoor*Wall32'))) notes.push(outdoorNote)

fs.writeFileSync(cataloguePath, `${JSON.stringify({ notes, pieces: [...kept, ...pieces] }, null, 2)}\n`)
for (const entry of pieces) {
  console.log(`${entry.id} ${entry.size.width}×${entry.size.height} anchorX=${entry.anchorX} (+r90/180/270)`)
}
console.log(`Wrote ${pieces.length} outdoor wall pieces (${pngFiles.length} PNGs); kept ${kept.length} other catalogue entries`)
