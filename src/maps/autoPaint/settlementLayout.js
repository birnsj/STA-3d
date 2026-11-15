// World Generation outdoor settlement layout (Outdoor Settlement / Outdoor Template 32).
// Inspired by Legacy colony + farm (path, several buildings, dirt yards) but owned here —
// does not import from maps/generators/*.
import biomeData from '../../data/adaptation/maps/biomes.json'
import { getTile } from '../mapFormat.js'
import { WORLD_DOOR_MARK, WORLD_WALL_UNDERLAY } from './constants.js'
import { pickDoorwayOffsets } from './doorways.js'

const BIOMES = biomeData.biomes ?? []
const biomeFor = (id) => BIOMES.find((entry) => entry.id === id) ?? BIOMES[0]

const MARKERS_PER_SIDE = 4
const UNDERLAY = WORLD_WALL_UNDERLAY
const DOOR = WORLD_DOOR_MARK
/** Interior rooms need walk space; outer building is at least this across (Legacy MIN_BUILDING). */
const MIN_ROOM = 4
const MIN_BUILDING = MIN_ROOM + 2
/** Base outer footprint before Building size slider (1 = 100%). Max can fit a 2-room split. */
const BASE_BUILDING = Object.freeze({ minW: 6, maxW: 11, minH: 6, maxH: 10 })
/** Target interior room span before Room size slider (smaller than deck rooms). */
const BASE_INTERIOR_SPAN = 4

const key = ({ x, y }) => `${x},${y}`
const randomInt = (random, min, max) => min + Math.floor(random() * (max - min + 1))
const clamp01 = (value) => Math.max(0, Math.min(1, value))

function shuffle(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const makeGrid = (width, height, tileAt) =>
  Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => tileAt(x, y)))

function roomCells(rect) {
  const cells = []
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) cells.push({ x, y })
  }
  return cells
}

function grow(rect, amount) {
  return {
    x0: rect.x0 - amount,
    x1: rect.x1 + amount,
    y0: rect.y0 - amount,
    y1: rect.y1 + amount,
  }
}

function neighboursOf({ x, y }) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ]
}

function inBounds(tiles, { x, y }) {
  return y >= 0 && x >= 0 && y < tiles.length && x < tiles[0].length
}

/**
 * Building footprint must sit on open field tiles; the one-tile margin may include the
 * main path so doors can face the road (Legacy colony places beside the track).
 */
function rectIsBuildable(tiles, rect, keep, { openIds, pathId }) {
  const width = tiles[0].length
  const height = tiles.length
  if (rect.x0 < 1 || rect.y0 < 1 || rect.x1 > width - 2 || rect.y1 > height - 2) return false
  if (roomCells(rect).some((cell) => keep.has(key(cell)))) return false
  if (roomCells(rect).some(({ x, y }) => !openIds.has(tiles[y][x]))) return false
  const margin = grow(rect, 1)
  return roomCells(margin).every(({ x, y }) => {
    if (keep.has(key({ x, y }))) return false
    const id = tiles[y][x]
    return openIds.has(id) || id === pathId
  })
}

/** Default outdoor wall faces for multi-building variety (Outdoor Template 32). */
export const OUTDOOR_SETTLEMENT_FACES = Object.freeze(['prefab', 'barn', 'city', 'timber'])

/** Outdoor Template 32 wall piece ids per building face (Generate Map packs these). */
export const OUTDOOR_WALL_FACE_PIECES = Object.freeze({
  prefab: {
    straight: 'tplOutdoorPrefabWall32',
    straightLong: 'tplOutdoorPrefabWall32Long',
    corner: 'tplOutdoorPrefabWall32Corner',
  },
  barn: {
    straight: 'tplOutdoorBarnWall32',
    straightLong: 'tplOutdoorBarnWall32Long',
    corner: 'tplOutdoorBarnWall32Corner',
  },
  city: {
    straight: 'tplOutdoorCityWall32',
    straightLong: 'tplOutdoorCityWall32Long',
    corner: 'tplOutdoorCityWall32Corner',
  },
  timber: {
    straight: 'tplOutdoorTimberWall32',
    straightLong: 'tplOutdoorTimberWall32Long',
    corner: 'tplOutdoorTimberWall32Corner',
  },
  stone: {
    straight: 'tplOutdoorStoneWall32',
    straightLong: 'tplOutdoorStoneWall32Long',
    corner: 'tplOutdoorStoneWall32Corner',
  },
  ruin: {
    straight: 'tplOutdoorRuinWall32',
    straightLong: 'tplOutdoorRuinWall32Long',
    corner: 'tplOutdoorRuinWall32Corner',
  },
})

/** Face ids + labels for World Generation Ruleset Settlement settings. */
export const OUTDOOR_WALL_FACE_OPTIONS = Object.freeze(
  Object.keys(OUTDOOR_WALL_FACE_PIECES).map((id) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
  })),
)

/** Outdoor fence kit — 64×32 run + 32×32 corner + 64-wide gate (packs like building walls). */
export const OUTDOOR_FENCE_PIECE = 'tplOutdoorFence64'
export const OUTDOOR_FENCE_CORNER = 'tplOutdoorFence64Corner'
export const OUTDOOR_FENCE_GATE = 'tplOutdoorFenceGate64'
export const OUTDOOR_FENCE_KIT = Object.freeze({
  straight: OUTDOOR_FENCE_PIECE,
  corner: OUTDOOR_FENCE_CORNER,
})

/** Wood floors for barn/timber; stone flagstones for the rest (palette tiles). */
const WOOD_FACES = new Set(['barn', 'timber'])

export function interiorTileForFace(face, { wood = 'plankFloor', stone = 'templeFloor' } = {}) {
  if (WOOD_FACES.has(face)) {
    return getTile(wood) ? wood : getTile('plankFloor') ? 'plankFloor' : 'floor'
  }
  if (getTile(stone)) return stone
  if (getTile('templeFloor')) return 'templeFloor'
  if (getTile('pavement')) return 'pavement'
  return 'floor'
}

/**
 * 2-cell door with 1-cell corner clearance (same as starship) so both jamb walls pack coplanar.
 * `allowUnsafe`: exterior shells may fall back so buildings stay enterable; interior walls skip.
 */
function doorwayOffsets(random, first, last, { allowUnsafe = false } = {}) {
  const offsets = pickDoorwayOffsets(random, first, last, {
    doorCells: 2,
    cornerClearance: 1,
  })
  if (offsets?.length) return offsets
  if (!allowUnsafe) return []
  if (last <= first) return [first]
  const start = randomInt(random, first, Math.max(first, last - 1))
  return last > first ? [start, Math.min(start + 1, last)] : [start]
}

const DOOR_STEP = {
  top: [0, -1],
  bottom: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/**
 * Closed building shell: templateWall underlay on the ring (Outdoor Template 32 packs over it),
 * interior floor, two-cell doorway on `side`.
 */
function placeBuildingShell(tiles, keep, rect, side, random, { interior = 'floor' } = {}) {
  const underlayKeys = []
  roomCells(rect).forEach(({ x, y }) => {
    const onRing = x === rect.x0 || x === rect.x1 || y === rect.y0 || y === rect.y1
    tiles[y][x] = onRing ? UNDERLAY : interior
    if (onRing) underlayKeys.push(key({ x, y }))
  })
  const along = side === 'top' || side === 'bottom'
  const offsets = along
    ? doorwayOffsets(random, rect.x0 + 1, rect.x1 - 1, { allowUnsafe: true })
    : doorwayOffsets(random, rect.y0 + 1, rect.y1 - 1, { allowUnsafe: true })
  const cellAt = (offset) =>
    ({
      top: { x: offset, y: rect.y0 },
      bottom: { x: offset, y: rect.y1 },
      left: { x: rect.x0, y: offset },
      right: { x: rect.x1, y: offset },
    })[side]
  const doorCells = offsets.map(cellAt)
  const step = DOOR_STEP[side]
  doorCells.forEach((cell) => {
    tiles[cell.y][cell.x] = interior
    keep.add(key({ x: cell.x - step[0], y: cell.y - step[1] }))
    keep.add(key({ x: cell.x + step[0], y: cell.y + step[1] }))
  })
  const doorKeySet = new Set(doorCells.map(key))
  const wallUnderlay = underlayKeys.filter((entry) => !doorKeySet.has(entry))
  const door = doorCells[0]
  const outside = { x: door.x + step[0], y: door.y + step[1] }
  return {
    room: { x0: rect.x0 + 1, x1: rect.x1 - 1, y0: rect.y0 + 1, y1: rect.y1 - 1 },
    door,
    outside,
    underlayKeys: wallUnderlay,
    doorKeys: doorCells.map(key),
  }
}

/**
 * How many rooms fit along a span (Room size sets preferred span; hard cap is MIN_ROOM).
 */
function preferredRoomCount(length, roomScale) {
  const scale = Number.isFinite(Number(roomScale)) && Number(roomScale) > 0 ? Number(roomScale) : 1
  const span = Math.max(MIN_ROOM, Math.round(BASE_INTERIOR_SPAN * scale))
  const maxCount = Math.max(1, Math.floor((length + 1) / (MIN_ROOM + 1)))
  const preferred = Math.max(1, Math.round((length + 1) / (span + 1)))
  return Math.min(maxCount, preferred)
}

/**
 * Split a span into `count` room ranges with a one-cell gap for walls.
 */
function splitInteriorAxis(start, length, random, count) {
  const maxCount = Math.max(1, Math.floor((length + 1) / (MIN_ROOM + 1)))
  const rooms = Math.max(1, Math.min(maxCount, Math.round(count)))
  if (rooms <= 1) return [[start, start + length - 1]]
  const floor = length - (rooms - 1)
  const sizes = Array.from({ length: rooms }, (_, i) => Math.floor(floor / rooms) + (i < floor % rooms ? 1 : 0))
  for (let i = 0; i < rooms - 1; i++) {
    const shift = randomInt(random, -1, 1)
    if (sizes[i] + shift >= MIN_ROOM && sizes[i + 1] - shift >= MIN_ROOM) {
      sizes[i] += shift
      sizes[i + 1] -= shift
    }
  }
  let next = start
  return sizes.map((size) => {
    const range = [next, next + size - 1]
    next += size + 1
    return range
  })
}

/**
 * Subdivide a building interior into rooms with templateWall dividers and doorways.
 * Small footprints stay a single open room. Outdoor Template 32 packs the underlay.
 * `roomsInBuilding` (0–1) lerps from one open room to the Room-size preferred count.
 */
function partitionBuildingInterior(
  tiles,
  keep,
  rect,
  random,
  { interior = 'floor', roomScale = 1, roomsInBuilding = 1, doorsInBuilding = 1 } = {},
) {
  const inner = { x0: rect.x0 + 1, x1: rect.x1 - 1, y0: rect.y0 + 1, y1: rect.y1 - 1 }
  const iw = inner.x1 - inner.x0 + 1
  const ih = inner.y1 - inner.y0 + 1
  const density = Number.isFinite(Number(roomsInBuilding)) ? clamp01(Number(roomsInBuilding)) : 1
  // 0% Rooms in building → open floor (no interior walls).
  if (density <= 0) {
    return { rooms: [inner], underlayKeys: [], doorKeys: [] }
  }
  const canSplitX = iw >= MIN_ROOM * 2 + 1
  const canSplitY = ih >= MIN_ROOM * 2 + 1
  if (!canSplitX && !canSplitY) {
    return { rooms: [inner], underlayKeys: [], doorKeys: [] }
  }

  // Rooms % = fraction of the preferred room count (Room size). 0% → 1, 50% → ~half, 100% → preferred.
  const countAlong = (length, canSplit) => {
    if (!canSplit) return 1
    const preferred = preferredRoomCount(length, roomScale)
    if (density >= 1) return preferred
    return Math.max(1, Math.round(preferred * density))
  }
  const columns = splitInteriorAxis(inner.x0, iw, random, countAlong(iw, canSplitX))
  const rows = splitInteriorAxis(inner.y0, ih, random, countAlong(ih, canSplitY))

  if (columns.length === 1 && rows.length === 1) {
    return { rooms: [inner], underlayKeys: [], doorKeys: [] }
  }

  const underlayKeys = []
  columns.slice(0, -1).forEach(([, x1]) => {
    const wx = x1 + 1
    for (let y = inner.y0; y <= inner.y1; y++) {
      tiles[y][wx] = UNDERLAY
      underlayKeys.push(key({ x: wx, y }))
    }
  })
  rows.slice(0, -1).forEach(([, y1]) => {
    const wy = y1 + 1
    for (let x = inner.x0; x <= inner.x1; x++) {
      tiles[wy][x] = UNDERLAY
      underlayKeys.push(key({ x, y: wy }))
    }
  })

  const doorDensity = Number.isFinite(Number(doorsInBuilding)) ? clamp01(Number(doorsInBuilding)) : 1
  const doorKeys = []
  const cutInteriorDoor = (cells, step) => {
    cells.forEach((cell) => {
      tiles[cell.y][cell.x] = interior
      doorKeys.push(key(cell))
      keep.add(key({ x: cell.x - step[0], y: cell.y - step[1] }))
      keep.add(key({ x: cell.x + step[0], y: cell.y + step[1] }))
    })
  }

  // Collect every interior wall that can take a doorway, then keep the Doors % fraction.
  const candidates = []
  const grid = rows.map(([y0, y1]) => columns.map(([x0, x1]) => ({ x0, x1, y0, y1 })))
  grid.forEach((row) => {
    row.forEach((room, col) => {
      const east = row[col + 1]
      if (!east) return
      const y0 = Math.max(room.y0, east.y0)
      const y1 = Math.min(room.y1, east.y1)
      if (y1 - y0 < 1) return
      candidates.push({
        axis: 'x',
        first: y0,
        last: y1,
        cellsAt: (offsets) => offsets.map((y) => ({ x: room.x1 + 1, y })),
        step: [1, 0],
      })
    })
  })
  for (let r = 0; r < grid.length - 1; r++) {
    grid[r].forEach((room, col) => {
      const south = grid[r + 1][col]
      if (!south) return
      const x0 = Math.max(room.x0, south.x0)
      const x1 = Math.min(room.x1, south.x1)
      if (x1 - x0 < 1) return
      candidates.push({
        axis: 'y',
        first: x0,
        last: x1,
        cellsAt: (offsets) => offsets.map((x) => ({ x, y: room.y1 + 1 })),
        step: [0, 1],
      })
    })
  }
  const doorTarget =
    doorDensity <= 0 ? 0 : doorDensity >= 1 ? candidates.length : Math.round(candidates.length * doorDensity)
  const chosen = doorTarget >= candidates.length ? candidates : shuffle(candidates, random).slice(0, doorTarget)
  for (const candidate of chosen) {
    const offsets = doorwayOffsets(random, candidate.first, candidate.last)
    if (!offsets.length) continue
    cutInteriorDoor(candidate.cellsAt(offsets), candidate.step)
  }

  const doorKeySet = new Set(doorKeys)
  return {
    rooms: grid.flat(),
    underlayKeys: underlayKeys.filter((entry) => !doorKeySet.has(entry)),
    doorKeys,
  }
}

/** Place a solid prop tile if it stays on open grass and does not pinch connectivity badly. */
function tryPlaceSolid(tiles, keep, cell, tileId, openId) {
  if (!inBounds(tiles, cell) || keep.has(key(cell))) return false
  if (tiles[cell.y][cell.x] !== openId) return false
  if (!getTile(tileId)) return false
  tiles[cell.y][cell.x] = tileId
  keep.add(key(cell))
  return true
}

/**
 * Biome trees / rocks / edge plants on open grass (colony-style density).
 * Uses biomes.json only — not Legacy generator modules.
 */
export function scatterSettlementFeatures(tiles, keep, biomeId, random, { grass = 'grass', scale = 0.35 } = {}) {
  const biome = biomeFor(biomeId)
  if (!biome || scale <= 0) return
  const width = tiles[0].length
  const height = tiles.length
  const area = width * height
  const edge = ({ x, y }) => Math.min(x, y, width - 1 - x, height - 1 - y) <= 1

  for (const feature of biome.features ?? []) {
    const count = Math.max(0, Math.round((area / (feature.per ?? 40)) * scale))
    if (feature.kind === 'scatter' && feature.tile) {
      const spots = shuffle(
        tiles.flatMap((row, y) => row.map((_, x) => ({ x, y }))),
        random,
      )
      let placed = 0
      for (const cell of spots) {
        if (placed >= count) break
        if (tryPlaceSolid(tiles, keep, cell, feature.tile, grass)) placed += 1
      }
    } else if (feature.kind === 'blob' && feature.tiles?.length) {
      const spots = shuffle(
        tiles.flatMap((row, y) => row.map((_, x) => ({ x, y }))),
        random,
      )
      let spot = 0
      for (let i = 0; i < count; i++) {
        const start = spots[spot++ % spots.length]
        if (!start) break
        const tile = feature.tiles[randomInt(random, 0, feature.tiles.length - 1)]
        const size = Array.isArray(feature.size)
          ? randomInt(random, feature.size[0], feature.size[1])
          : 3
        let cell = start
        for (let n = 0; n < size; n++) {
          tryPlaceSolid(tiles, keep, cell, tile, grass)
          const next = shuffle(neighboursOf(cell), random).find(
            (c) => inBounds(tiles, c) && tiles[c.y][c.x] === grass && !keep.has(key(c)),
          )
          if (!next) break
          cell = next
        }
      }
    }
  }

  const plants = biome.plants ?? []
  if (plants.length) {
    const edgeCount = Math.round(((width + height) * 0.4 * scale) / plants.length)
    for (const plant of plants) {
      const spots = shuffle(
        tiles.flatMap((row, y) => row.map((_, x) => ({ x, y }))).filter(edge),
        random,
      )
      let placed = 0
      for (const cell of spots) {
        if (placed >= edgeCount) break
        if (tryPlaceSolid(tiles, keep, cell, plant, grass)) placed += 1
      }
    }
  }

}

/**
 * Mid-side cell on the fence ring (outer = grow(crop, 1)) for a 1-cell / 64px gate.
 * Never a corner — needs clearance for corner posts + jambs.
 */
function fieldGateRingCells(outer, crop, side) {
  if (side === 'top' || side === 'bottom') {
    const y = side === 'top' ? outer.y0 : outer.y1
    const span = crop.x1 - crop.x0 + 1
    if (span < 1) return []
    const x = crop.x0 + Math.floor(span / 2)
    return [{ x, y }]
  }
  const x = side === 'left' ? outer.x0 : outer.x1
  const span = crop.y1 - crop.y0 + 1
  if (span < 1) return []
  const y = crop.y0 + Math.floor(span / 2)
  return [{ x, y }]
}

/**
 * Crop field with a closed Template 32-style fence ring (64×32 + corner + 64 gate).
 * Outer grass ring is the fence footprint (like a building shell); Generate Map packs
 * OUTDOOR_FENCE_KIT over it. Returns `{ cropRect, fenceRing }` or null.
 */
function plantFencedField(tiles, keep, rect, random, { grass, crop = 'cropRows', tallCrop = 'tallCrop' }) {
  if (!getTile(crop)) return null
  const outer = grow(rect, 1)
  if (roomCells(outer).some((cell) => !inBounds(tiles, cell) || keep.has(key(cell)))) return null
  if (roomCells(outer).some(({ x, y }) => tiles[y][x] !== grass)) return null

  roomCells(rect).forEach(({ x, y }) => {
    tiles[y][x] = crop
    keep.add(key({ x, y }))
  })
  if (getTile(tallCrop)) {
    roomCells(rect)
      .filter(({ y }) => (y - rect.y0) % 2 === 1)
      .forEach((cell) => {
        tiles[cell.y][cell.x] = tallCrop
        keep.add(key(cell))
      })
  }

  const side = shuffle(['top', 'bottom', 'left', 'right'], random)[0]
  const gateCells = fieldGateRingCells(outer, rect, side)
  const doorKeys = gateCells.map(key)

  // Keep the whole outer ring clear so packing owns the perimeter.
  roomCells(outer).forEach((cell) => {
    if (inBounds(tiles, cell)) keep.add(key(cell))
  })

  return {
    cropRect: rect,
    fenceRing: {
      rect: outer,
      doorKeys,
    },
  }
}

/** Place up to `maxFields` fenced crop fields on open grass. */
function placeFencedFields(
  tiles,
  keep,
  random,
  {
    grass,
    crop,
    tallCrop,
    maxFields = 3,
    preferCorners = false,
  },
) {
  if (!getTile(crop)) return { fields: [], fenceRings: [] }
  const width = tiles[0].length
  const height = tiles.length
  const fields = []
  const fenceRings = []
  const cornerOrigins = preferCorners
    ? shuffle(
        [
          { x0: 2, y0: 2 },
          { x0: Math.max(2, width - 9), y0: 2 },
          { x0: 2, y0: Math.max(2, height - 7) },
          { x0: Math.max(2, width - 9), y0: Math.max(2, height - 7) },
        ],
        random,
      )
    : []
  for (let attempt = 0; attempt < 120 && fields.length < maxFields; attempt++) {
    const w = randomInt(random, 3, preferCorners ? 5 : 7)
    const h = randomInt(random, 3, preferCorners ? 4 : 5)
    if (w > width - 4 || h > height - 4) continue
    let x0
    let y0
    if (preferCorners && attempt < cornerOrigins.length) {
      x0 = Math.min(cornerOrigins[attempt].x0, width - 2 - w)
      y0 = Math.min(cornerOrigins[attempt].y0, height - 2 - h)
    } else {
      x0 = randomInt(random, 2, width - 2 - w)
      y0 = randomInt(random, 2, height - 2 - h)
    }
    const rect = { x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 }
    const planted = plantFencedField(tiles, keep, rect, random, {
      grass,
      crop,
      tallCrop,
    })
    if (!planted) continue
    roomCells(grow(rect, 1)).forEach((cell) => {
      if (inBounds(tiles, cell)) keep.add(key(cell))
    })
    fields.push(planted.cropRect)
    fenceRings.push(planted.fenceRing)
  }
  return { fields, fenceRings }
}

/**
 * Dirt apron around a building, then path edging where that dirt meets grass.
 * Outer dirt cells that touch grass become `path` (edged yard).
 */
function paintYardAndEdge(tiles, keep, rect, { dirt, grass, path, yard = 2 }) {
  // Solid dirt pad around the building (not just a hollow frame).
  const apron = grow(rect, yard)
  roomCells(apron).forEach((cell) => {
    if (!inBounds(tiles, cell)) return
    if (keep.has(key(cell))) return
    if (tiles[cell.y][cell.x] !== grass && tiles[cell.y][cell.x] !== path) return
    // Leave building footprint alone (walls / interior already painted).
    if (cell.x >= rect.x0 && cell.x <= rect.x1 && cell.y >= rect.y0 && cell.y <= rect.y1) return
    tiles[cell.y][cell.x] = dirt
  })
  // Path edging: only the outer ring of the apron (where dirt meets grass).
  const outer = grow(rect, yard)
  const inner = grow(rect, yard - 1)
  roomCells(outer).forEach((cell) => {
    if (!inBounds(tiles, cell)) return
    if (cell.x >= inner.x0 && cell.x <= inner.x1 && cell.y >= inner.y0 && cell.y <= inner.y1) return
    if (tiles[cell.y][cell.x] !== dirt) return
    const touchesGrass = neighboursOf(cell).some(
      (n) => inBounds(tiles, n) && tiles[n.y][n.x] === grass,
    )
    if (touchesGrass) tiles[cell.y][cell.x] = path
  })
}

function pickMarkers(playerCells, enemyCells, random) {
  const playerStarts = shuffle(playerCells, random).slice(0, MARKERS_PER_SIDE)
  const taken = new Set(playerStarts.map(key))
  const enemySpawns = shuffle(
    enemyCells.filter((cell) => !taken.has(key(cell))),
    random,
  ).slice(0, MARKERS_PER_SIDE)
  return { playerStarts, enemySpawns, horseSpawns: [] }
}

function markersAtEnds(cells, distance, random) {
  if (!cells.length) return { playerStarts: [], enemySpawns: [], horseSpawns: [] }
  const sorted = [...cells].sort((a, b) => distance(a) - distance(b))
  const pool = Math.max(1, Math.min(MARKERS_PER_SIDE * 3, Math.floor(sorted.length / 2) || sorted.length))
  return pickMarkers(sorted.slice(0, pool), sorted.slice(Math.max(0, sorted.length - pool)), random)
}

/**
 * Outdoor settlement: grass field, main path, several buildings with different wall faces,
 * dirt yards edged with path where they meet grass. Large buildings get interior rooms.
 *
 * @param {object} map `{ width, height }`
 * @param {object} options tile ids + faces
 * @param {number} [buildingScale=1] Map Properties Building size (1 = 100%) — outer footprint
 * @param {number} [roomScale=1] Map Properties Room size (1 = 100%) — interior room span
 * @param {number} [roomsInBuilding=1] Map Properties Rooms in building (0–1) — how fully to subdivide
 * @param {number} [doorsInBuilding=1] Map Properties Doors in building (0–1) — interior doorway density
 * @param {boolean} [includeBuildings=true] Map Properties Buildings checkbox
 * @param {boolean} [includeRoads=true] Map Properties Roads checkbox — main path + door stubs
 */
export function generateSettlementLayout(
  map,
  random = Math.random,
  {
    grass = 'grass',
    dirt = 'ground',
    path = 'path',
    interior = null,
    interiorWood = 'plankFloor',
    interiorStone = 'templeFloor',
    faces = OUTDOOR_SETTLEMENT_FACES,
    buildingScale = 1,
    roomScale = 1,
    roomsInBuilding = 1,
    doorsInBuilding = 1,
    includeBuildings = true,
    includeRoads = true,
    biomeId = null,
    featureScale = 0.75,
    fields = true,
    fence = null,
    crop = 'cropRows',
    tallCrop = 'tallCrop',
    maxFields = 3,
  } = {},
) {
  const { width, height } = map
  const tiles = makeGrid(width, height, () => grass)
  const keep = new Set()
  const faceList = (
    (faces?.length ? faces : OUTDOOR_SETTLEMENT_FACES).filter((face) => OUTDOOR_WALL_FACE_PIECES[face])
  )
  if (!faceList.length) faceList.push('prefab')
  const bScale = Number.isFinite(Number(buildingScale)) && Number(buildingScale) > 0 ? Number(buildingScale) : 1
  const rScale = Number.isFinite(Number(roomScale)) && Number(roomScale) > 0 ? Number(roomScale) : 1
  const roomDensity = Number.isFinite(Number(roomsInBuilding)) ? clamp01(Number(roomsInBuilding)) : 1
  const doorDensity = Number.isFinite(Number(doorsInBuilding)) ? clamp01(Number(doorsInBuilding)) : 1
  const placeBuildings = includeBuildings !== false
  const placeRoads = includeRoads !== false
  const biome = biomeId ? biomeFor(biomeId) : null
  const floorOpts = { wood: interiorWood, stone: interiorStone }
  const interiorIds = new Set()
  const rotatedKeys = new Set()
  // fence option kept for ruleset compatibility; rings use OUTDOOR_FENCE_KIT pieces.
  void fence

  const horizontal = width >= height
  const across = horizontal ? height : width
  const pathWidth = across >= 14 ? 2 : 1
  const middle =
    Math.floor((across - pathWidth) / 2) + randomInt(random, -Math.floor(across / 8), Math.floor(across / 8))
  const pathStart = Math.max(1, Math.min(across - 1 - pathWidth, middle))
  if (placeRoads) {
    tiles.forEach((row, y) =>
      row.forEach((_, x) => {
        const offset = (horizontal ? y : x) - pathStart
        if (offset >= 0 && offset < pathWidth) tiles[y][x] = path
      }),
    )
  }

  // Corner fields first (small keep) so crops stay visible without blocking all building sites.
  const earlyFieldCount = fields !== false ? Math.min(2, Math.max(1, Number(maxFields) || 3)) : 0
  const early =
    earlyFieldCount > 0
      ? placeFencedFields(tiles, keep, random, {
          grass,
          crop,
          tallCrop,
          maxFields: earlyFieldCount,
          preferCorners: true,
        })
      : { fields: [], fenceRings: [] }
  let fieldRects = early.fields
  let fenceRings = early.fenceRings

  const doorSide = (rect) =>
    horizontal ? (rect.y1 < pathStart ? 'bottom' : 'top') : rect.x1 < pathStart ? 'right' : 'left'

  // Count from map area (Legacy colony); Building size grows footprints, so fewer may fit.
  const targetCount = placeBuildings ? Math.max(2, Math.min(5, Math.round((width * height) / 110))) : 0
  const openIds = new Set([grass, dirt])
  const buildings = []
  // Soften oversized footprints when placement keeps failing (Legacy placeBuildings).
  const buildingSide = (min, max, attempt) => {
    const soft = Math.max(Math.min(bScale, 1), bScale - Math.floor(attempt / 40) * 0.25)
    return randomInt(
      random,
      Math.max(Math.round(min * soft), MIN_BUILDING),
      Math.max(Math.round(max * soft), MIN_BUILDING),
    )
  }
  for (let attempt = 0; attempt < 200 && buildings.length < targetCount; attempt++) {
    const w = buildingSide(BASE_BUILDING.minW, BASE_BUILDING.maxW, attempt)
    const h = buildingSide(BASE_BUILDING.minH, BASE_BUILDING.maxH, attempt)
    if (w > width - 2 || h > height - 2) continue
    const x0 = randomInt(random, 1, width - 1 - w)
    const y0 = randomInt(random, 1, height - 1 - h)
    const rect = { x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 }
    if (!rectIsBuildable(tiles, rect, keep, { openIds, pathId: path })) continue
    const side = doorSide(rect)
    const face = faceList[buildings.length % faceList.length] || 'prefab'
    const roomFloor =
      (interior && getTile(interior) ? interior : null) || interiorTileForFace(face, floorOpts)
    interiorIds.add(roomFloor)
    const shell = placeBuildingShell(tiles, keep, rect, side, random, { interior: roomFloor })
    const interiorRooms = partitionBuildingInterior(tiles, keep, rect, random, {
      interior: roomFloor,
      roomScale: rScale,
      roomsInBuilding: roomDensity,
      doorsInBuilding: doorDensity,
    })
    // Path stub from door to the main path.
    if (placeRoads) {
      let cursor = { ...shell.outside }
      for (let step = 0; step < 8 && inBounds(tiles, cursor); step++) {
        if (tiles[cursor.y][cursor.x] === path) break
        if (tiles[cursor.y][cursor.x] === grass || tiles[cursor.y][cursor.x] === dirt) {
          tiles[cursor.y][cursor.x] = path
        }
        const dir = DOOR_STEP[side]
        cursor = { x: cursor.x + dir[0], y: cursor.y + dir[1] }
      }
    }
    paintYardAndEdge(tiles, keep, rect, { dirt, grass, path: placeRoads ? path : dirt, yard: 2 })
    roomCells(grow(rect, 2)).forEach((cell) => {
      if (inBounds(tiles, cell)) keep.add(key(cell))
    })
    buildings.push({
      rect,
      face,
      interior: roomFloor,
      underlayKeys: [...shell.underlayKeys, ...interiorRooms.underlayKeys],
      doorKeys: [...shell.doorKeys, ...interiorRooms.doorKeys],
      room: shell.room,
      rooms: interiorRooms.rooms,
    })
  }

  // Extra fields on leftover grass after buildings.
  if (fields !== false) {
    const more = placeFencedFields(tiles, keep, random, {
      grass,
      crop,
      tallCrop,
      maxFields: Math.max(0, Math.min(4, Number(maxFields) || 3) - fieldRects.length),
    })
    fieldRects = [...fieldRects, ...more.fields]
    fenceRings = [...fenceRings, ...more.fenceRings]
  }

  // Trees / rocks / edge plants on remaining grass (yards + fields kept clear).
  if (biomeId) scatterSettlementFeatures(tiles, keep, biomeId, random, { grass, scale: featureScale })

  const walkable = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = tiles[y][x]
      if (id === UNDERLAY || id === DOOR) continue
      const tile = getTile(id)
      if (tile?.solid) continue
      if (id === grass || id === dirt || id === path || interiorIds.has(id) || id === crop) {
        walkable.push({ x, y })
      }
    }
  }
  const flip = random() < 0.5 ? 1 : -1
  const markers = markersAtEnds(
    walkable.filter(({ x, y }) => !interiorIds.has(tiles[y][x])),
    (cell) => flip * (horizontal ? cell.x : cell.y),
    random,
  )

  const areas = [
    ...buildings.flatMap((building, buildingIndex) => {
      const rooms = building.rooms?.length ? building.rooms : [building.room]
      const floorId = building.interior
      return rooms.map((room, roomIndex) => {
        const floorCell = roomCells(room).find(({ x, y }) => tiles[y][x] === floorId)
        return {
          name: rooms.length > 1 ? `Building ${buildingIndex + 1} · Room ${roomIndex + 1}` : `Building ${buildingIndex + 1}`,
          position: floorCell || { x: room.x0, y: room.y0 },
        }
      })
    }),
    ...fieldRects.map((rect, index) => ({
      name: `Field ${index + 1}`,
      position: { x: rect.x0 + Math.floor((rect.x1 - rect.x0) / 2), y: rect.y0 + Math.floor((rect.y1 - rect.y0) / 2) },
    })),
  ]

  const doorKeys = buildings.flatMap((building) => building.doorKeys)
  const underlayKeys = buildings.flatMap((building) => building.underlayKeys)

  return {
    tiles,
    floorUnder: {},
    markers,
    areas,
    buildings,
    fields: fieldRects,
    fenceRings,
    doorKeys,
    underlayKeys,
    rotatedKeys: [...rotatedKeys],
  }
}

/** Whether this ruleset should use settlement layout (not the starship deck grid). */
export function rulesetUsesSettlementLayout(ruleset) {
  const env = ruleset?.environment
  return env === 'outdoorSettlement' || env === 'naturalTerrain'
}
