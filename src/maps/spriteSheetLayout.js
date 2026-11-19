// Sprite Sheets composer: 1K / 2K pixel canvases with an isometric tile grid (64×32 diamonds).

import { project, propImageBox, TILE_H, TILE_W, tileImageBox } from './iso.js'

export const SHEET_CELL = { width: TILE_W, height: TILE_H }

// Axis-aligned overlay cells for the composer. Default matches the iso diamond footprint.
export const SHEET_SQUARE_GRID_PRESETS = [
  { id: '8x8', label: '8×8', width: 8, height: 8 },
  { id: '16x16', label: '16×16', width: 16, height: 16 },
  { id: '32x16', label: '32×16', width: 32, height: 16 },
  { id: '32x32', label: '32×32', width: 32, height: 32 },
  { id: '64x32', label: '64×32', width: TILE_W, height: TILE_H },
  { id: '64x64', label: '64×64', width: 64, height: 64 },
  { id: '96x48', label: '96×48', width: 96, height: 48 },
  { id: '96x96', label: '96×96', width: 96, height: 96 },
  { id: '128x64', label: '128×64', width: 128, height: 64 },
  { id: '128x128', label: '128×128', width: 128, height: 128 },
  { id: '192x96', label: '192×96', width: 192, height: 96 },
  { id: '256x128', label: '256×128', width: 256, height: 128 },
  { id: '256x256', label: '256×256', width: 256, height: 256 },
]

export const DEFAULT_SHEET_SQUARE_GRID = '64x32'

export function sheetSquareGridPreset(id) {
  return SHEET_SQUARE_GRID_PRESETS.find((entry) => entry.id === id) || SHEET_SQUARE_GRID_PRESETS[0]
}

// Pixel gap Autopack keeps between stamp image rects (and from the sheet edge).
export const SHEET_PACK_GAP_PRESETS = [
  { id: '0', label: '0px', gap: 0 },
  { id: '1', label: '1px', gap: 1 },
  { id: '2', label: '2px', gap: 2 },
  { id: '4', label: '4px', gap: 4 },
  { id: '8', label: '8px', gap: 8 },
  { id: '16', label: '16px', gap: 16 },
  { id: '32', label: '32px', gap: 32 },
  { id: '64', label: '64px', gap: 64 },
]

export const DEFAULT_SHEET_PACK_GAP = '1'

export function sheetPackGapPreset(id) {
  return SHEET_PACK_GAP_PRESETS.find((entry) => entry.id === id) || SHEET_PACK_GAP_PRESETS[1]
}

export const SHEET_PRESETS = {
  '1k': {
    id: '1k',
    label: '1K',
    width: 1152,
    height: 864,
  },
  '2k': {
    id: '2k',
    label: '2K',
    width: 2304,
    height: 1728,
  },
}

export const DEFAULT_SHEET_PRESET = '1k'

export function sheetPreset(id) {
  return SHEET_PRESETS[id] || SHEET_PRESETS[DEFAULT_SHEET_PRESET]
}

// Iso origin (tile 0,0 diamond centre) sits near the middle of the sheet.
export function sheetIsoOrigin(preset) {
  const size = sheetPreset(preset?.id || preset)
  return {
    originX: Math.round(size.width / 2),
    // Bias slightly up so tall wall sprites have room above the floor line.
    originY: Math.round(size.height * 0.58),
  }
}

export function sheetGridSize(preset) {
  const size = sheetPreset(preset?.id || preset)
  return {
    cols: Math.floor(size.width / SHEET_CELL.width),
    rows: Math.floor(size.height / SHEET_CELL.height),
  }
}

// stamp.size is catalogue design size (e.g. 49×117 for a 64×32×92 wall), not a full-tile stretch box.
function stampSize(stamp) {
  const width = Math.max(1, Math.round(Number(stamp?.size?.width) || TILE_W))
  const height = Math.max(1, Math.round(Number(stamp?.size?.height) || 96))
  return { width, height }
}

function stampSheetRect(stamp, origin) {
  const size = stampSize(stamp)
  const box =
    stamp.plant === 'tip'
      ? propImageBox({ x: stamp.x, y: stamp.y }, size, stamp.anchorX)
      : tileImageBox({ x: stamp.x, y: stamp.y }, size)
  return {
    x: origin.originX + box.x,
    y: origin.originY + box.y,
    width: size.width,
    height: size.height,
  }
}

function rectsOverlap(a, b, pad = 1) {
  return (
    a.x < b.x + b.width + pad &&
    a.x + a.width + pad > b.x &&
    a.y < b.y + b.height + pad &&
    a.y + a.height + pad > b.y
  )
}

function rectFitsSheet(rect, preset, margin = 0) {
  const m = Math.max(0, Number(margin) || 0)
  return (
    rect.x >= m &&
    rect.y >= m &&
    rect.x + rect.width + m <= preset.width &&
    rect.y + rect.height + m <= preset.height
  )
}

// stamp.footprint is in tile units (design px / 64), matching Template Piece world footprints.
// Tip plant: tip is the +X/+Y corner. Center plant: AABB centred on the tile.
export function stampFootprintAabb(stamp) {
  const width = Math.max(0.25, Number(stamp?.footprint?.width) || 1)
  const depth = Math.max(0.25, Number(stamp?.footprint?.depth) || width)
  if (stamp?.plant === 'tip') {
    return { minX: stamp.x - width, maxX: stamp.x, minY: stamp.y - depth, maxY: stamp.y }
  }
  return {
    minX: stamp.x - width / 2,
    maxX: stamp.x + width / 2,
    minY: stamp.y - depth / 2,
    maxY: stamp.y + depth / 2,
  }
}

function aabbsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

export function stampsFootprintsOverlap(a, b) {
  return aabbsOverlap(stampFootprintAabb(a), stampFootprintAabb(b))
}

export function stampHitsCell(stamp, tileX, tileY) {
  if (stamp.x === tileX && stamp.y === tileY) return true
  return aabbsOverlap(stampFootprintAabb(stamp), {
    minX: tileX,
    maxX: tileX + 1,
    minY: tileY,
    maxY: tileY + 1,
  })
}

export function stampHitsPoint(stamp, point) {
  if (!point) return false
  const box = stampFootprintAabb(stamp)
  return (
    point.x >= box.minX - 1e-9 &&
    point.x <= box.maxX + 1e-9 &&
    point.y >= box.minY - 1e-9 &&
    point.y <= box.maxY + 1e-9
  )
}

// Design px (64 = one tile) or already-tile-unit footprints → tile units for hover / overlap.
export function footprintTilesFromDesign(fp) {
  if (!fp) return { width: 1, depth: 1 }
  const width = Number(fp.width)
  const depth = Number(fp.depth > 0 ? fp.depth : fp.width)
  if (!(width > 0) || !(depth > 0)) return { width: 1, depth: 1 }
  // Small integers are already tile cells (e.g. big 2×2).
  if (width <= 8 && depth <= 8) return { width: Math.max(0.25, width), depth: Math.max(0.25, depth) }
  return { width: Math.max(0.25, width / 64), depth: Math.max(0.25, depth / 64) }
}

// Placement candidates covering the sheet. Tip pieces use the 32px (0.5 tile) grid; full tiles use 1.
function packCandidateTiles(preset, step = 1) {
  const span = Math.max(sheetGridSize(preset).cols, sheetGridSize(preset).rows) + 8
  const list = []
  const gridStep = step > 0 ? step : 1
  for (let y = -span; y <= span + 1e-9; y += gridStep) {
    for (let x = -span; x <= span + 1e-9; x += gridStep) {
      list.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 })
    }
  }
  list.sort((a, b) => {
    const pa = project(a)
    const pb = project(b)
    if (pa.y !== pb.y) return pa.y - pb.y
    return pa.x - pb.x
  })
  return list
}

/**
 * Rearrange stamps onto free iso cells so drawn sprites stay on-sheet and do not overlap.
 * Larger stamps are placed first. Options: { gap } pixel spacing between image rects / sheet edge.
 * Returns { stamps, packed, unfit, gap }.
 */
export function packSheetStamps(stamps, presetOrId, options = {}) {
  const list = Array.isArray(stamps) ? stamps : []
  if (!list.length) return { stamps: list, packed: 0, unfit: 0, gap: 0 }

  const gapRaw = Number(options.gap ?? options.pad ?? 1)
  const gap = Number.isFinite(gapRaw) ? Math.max(0, Math.round(gapRaw)) : 1
  const preset = sheetPreset(presetOrId)
  const origin = sheetIsoOrigin(preset)
  const ordered = [...list].sort((a, b) => {
    const area = stampSize(b).width * stampSize(b).height - stampSize(a).width * stampSize(a).height
    if (area) return area
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
  // Half-tile candidates when any tip-anchored wall/piece is present (matches TEMPLATE_PIECE_CELL_PX).
  const step = ordered.some((stamp) => stamp.plant === 'tip') ? 0.5 : 1
  const candidates = packCandidateTiles(preset, step)

  const placed = []
  const placedRects = []
  let packed = 0
  let unfit = 0

  for (const stamp of ordered) {
    let found = null
    for (const pos of candidates) {
      const trial = { ...stamp, x: pos.x, y: pos.y }
      const rect = stampSheetRect(trial, origin)
      if (!rectFitsSheet(rect, preset, gap)) continue
      if (placedRects.some((other) => rectsOverlap(other, rect, gap))) continue
      if (placed.some((other) => stampsFootprintsOverlap(other, trial))) continue
      found = trial
      break
    }
    if (found) {
      placed.push(found)
      placedRects.push(stampSheetRect(found, origin))
      packed += 1
    } else {
      // Keep the previous cell so Autopack never drops a stamp. Reserve it when it does not
      // collide with already-packed stamps so later stamps can still avoid it.
      placed.push(stamp)
      const oldRect = stampSheetRect(stamp, origin)
      const collidesPacked =
        placedRects.some((other) => rectsOverlap(other, oldRect, gap)) ||
        placed.slice(0, -1).some((other) => stampsFootprintsOverlap(other, stamp))
      if (!collidesPacked) placedRects.push(oldRect)
      unfit += 1
    }
  }

  const byId = new Map(placed.map((stamp) => [stamp.id, stamp]))
  return {
    stamps: list.map((stamp) => byId.get(stamp.id) || stamp),
    packed,
    unfit,
    gap,
  }
}
