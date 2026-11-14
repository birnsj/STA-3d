// Auto-Paint doorway openings: on a 2-cell (128px) floor gap, place
// [Corner jamb][Doorway × tipUnits][Corner jamb] — default 2 Doorway tips = 64px door between 32px jambs.
// Openings paint as normal floor (no full-cell doorway tile). Independent of Legacy Map Generator.
import { cellKey } from '../mapFormat.js'
import { getTemplatePiece } from '../templatePieces.js'

export const AUTO_PAINT_DOORWAY_PIECE = 'tplStarshipDoorway32'
/** Opening lining width in tip units (32px). 2 × Doorway 32 = 64px. */
export const AUTO_PAINT_DOOR_TIP_UNITS = 2
/** Underlay cells for the floor gap (2 cells = 128px; lining is 64px, leftover tips for jambs). */
export const AUTO_PAINT_DOOR_CELLS = 2
/**
 * Min solid wall cells between a doorway edge and a room corner / T-junction.
 * Default 1: 64px door + jambs only needs one wall cell of corner standoff, so
 * more shared walls get openings (was 2 when doors sat flush without jamb tips).
 * Skip the door entirely when the shared wall is too short for this clearance.
 */
export const AUTO_PAINT_DOOR_CORNER_CLEARANCE = 1

/**
 * Choose underlay offsets for a doorway along a shared wall `[first, last]`.
 * Returns null when the span cannot keep `cornerClearance` cells of wall on
 * both sides of a `doorCells`-wide opening (caller should leave the wall solid).
 */
export function pickDoorwayOffsets(
  random,
  first,
  last,
  {
    doorCells = AUTO_PAINT_DOOR_CELLS,
    cornerClearance = AUTO_PAINT_DOOR_CORNER_CLEARANCE,
  } = {},
) {
  const width = Math.max(1, Math.floor(Number(doorCells)) || AUTO_PAINT_DOOR_CELLS)
  const clearance = Math.max(0, Math.floor(Number(cornerClearance)) || 0)
  if (last < first) return null
  const startMin = first + clearance
  const startMax = last - (width - 1) - clearance
  if (startMax < startMin) return null
  const span = startMax - startMin + 1
  const start = startMin + Math.floor(random() * span)
  return Array.from({ length: width }, (_, i) => start + i)
}

/**
 * Collapse contiguous doorway runs to at most `maxCells` (default 2 for 64px lining).
 * Extra cells become `wallId` with floorUnder filled via onRestore.
 * Mutates `tiles` (and calls onRestore for each restored wall cell).
 */
export function shrinkDoorwaysToMaxCells(tiles, width, height, doorId, wallId, maxCells = AUTO_PAINT_DOOR_CELLS, onRestore) {
  if (!doorId || !wallId || !tiles?.length) return
  const keep = Math.max(1, Math.floor(Number(maxCells)) || AUTO_PAINT_DOOR_CELLS)
  const isDoor = (x, y) => x >= 0 && y >= 0 && x < width && y < height && tiles[y][x] === doorId
  const visited = new Set()

  const shrinkRun = (cells) => {
    if (cells.length <= keep) return
    for (let i = keep; i < cells.length; i++) {
      const { x, y } = cells[i]
      tiles[y][x] = wallId
      onRestore?.(x, y)
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = cellKey({ x, y })
      if (!isDoor(x, y) || visited.has(key)) continue
      if (!isDoor(x - 1, y) && !isDoor(x + 1, y)) continue
      const cells = []
      let cx = x
      while (isDoor(cx, y)) {
        cells.push({ x: cx, y })
        visited.add(cellKey({ x: cx, y }))
        cx += 1
      }
      shrinkRun(cells)
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const key = cellKey({ x, y })
      if (!isDoor(x, y) || visited.has(key)) continue
      if (!isDoor(x, y - 1) && !isDoor(x, y + 1)) {
        visited.add(key)
        continue
      }
      const cells = []
      let cy = y
      while (isDoor(x, cy)) {
        cells.push({ x, y: cy })
        visited.add(cellKey({ x, y: cy }))
        cy += 1
      }
      shrinkRun(cells)
    }
  }
}

/** @deprecated Use shrinkDoorwaysToMaxCells — kept for older imports. */
export function shrinkDoorwaysToSingleCell(tiles, width, height, doorId, wallId, onRestore) {
  return shrinkDoorwaysToMaxCells(tiles, width, height, doorId, wallId, 1, onRestore)
}

/** Collect remaining doorway-mark cells (after shrink) as `{ x, y }` list. */
export function collectDoorCells(tiles, width, height, doorId) {
  const cells = []
  if (!doorId || !tiles?.length) return cells
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x] === doorId) cells.push({ x, y })
    }
  }
  return cells
}

/**
 * Replace doorway-mark cells with floor. Returns cell keys for packing / rebuild.
 * Mutates `tiles`.
 */
export function paintDoorCellsAsFloor(tiles, cells, floorForCell) {
  const keys = []
  for (const { x, y } of cells ?? []) {
    if (!tiles[y]) continue
    const floorId = typeof floorForCell === 'function' ? floorForCell(x, y) : floorForCell
    if (!floorId) continue
    tiles[y][x] = floorId
    keys.push(cellKey({ x, y }))
  }
  return keys
}

/**
 * Group opening keys into contiguous runs (horizontal first, then vertical, then singles).
 * @returns {{ alongX: boolean, cells: { x: number, y: number }[] }[]}
 */
export function doorRunsFromKeys(doorKeys) {
  const set = doorKeys instanceof Set ? doorKeys : new Set(doorKeys ?? [])
  const visited = new Set()
  const runs = []

  const parse = (key) => {
    const [x, y] = String(key).split(',').map(Number)
    return { x, y }
  }

  const sorted = [...set].sort((a, b) => {
    const pa = parse(a)
    const pb = parse(b)
    return pa.y - pb.y || pa.x - pb.x
  })

  for (const key of sorted) {
    if (visited.has(key) || !set.has(key)) continue
    const { x, y } = parse(key)
    if (set.has(cellKey({ x: x - 1, y })) || set.has(cellKey({ x: x + 1, y }))) {
      let cx = x
      while (set.has(cellKey({ x: cx - 1, y }))) cx -= 1
      const cells = []
      while (set.has(cellKey({ x: cx, y }))) {
        const k = cellKey({ x: cx, y })
        cells.push({ x: cx, y })
        visited.add(k)
        cx += 1
      }
      runs.push({ alongX: true, cells })
      continue
    }
    if (set.has(cellKey({ x, y: y - 1 })) || set.has(cellKey({ x, y: y + 1 }))) {
      let cy = y
      while (set.has(cellKey({ x, y: cy - 1 }))) cy -= 1
      const cells = []
      while (set.has(cellKey({ x, y: cy }))) {
        const k = cellKey({ x, y: cy })
        cells.push({ x, y: cy })
        visited.add(k)
        cy += 1
      }
      runs.push({ alongX: false, cells })
    }
  }

  for (const key of sorted) {
    if (visited.has(key)) continue
    runs.push({ alongX: true, cells: [parse(key)] })
    visited.add(key)
  }

  return runs
}

/** True when the Doorway 32 catalogue piece exists for lining. */
export function canLineAutoPaintDoorways() {
  return Boolean(getTemplatePiece(AUTO_PAINT_DOORWAY_PIECE))
}
