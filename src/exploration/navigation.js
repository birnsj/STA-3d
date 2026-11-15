// Exploration navigation on a map file's tile grid with continuous positions ({ x, y } in tiles, tile centres at whole
// numbers). Characters are circles that may not overlap a solid tile (walls, obstacles; anything outside the map counts
// as solid). Doorways are walkable tiles, so they need nothing special. Routes come from A* over the tiles and are then
// straightened wherever a character can walk directly.
// Template 32: empty templateWall underlay is not a full-cell solid; 32-thick Template Piece footprints are.
import { blocksMovement } from '../combat/battleMap.js'
import { circleHitsTemplateWalls, templatePieceCatalogueEpochOf } from '../maps/templatePieces.js'
import data from '../data/adaptation/exploration/partyControl.json'

export const RADIUS = data.movement.radius
const SAMPLE_STEP = 0.1
const SQRT2 = Math.SQRT2
const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
]

export const tileOf = (point) => ({ x: Math.round(point.x), y: Math.round(point.y) })
const solid = (map, x, y) => blocksMovement(map, { x, y })
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

/** True when the map has Template Piece footprints that A* must respect (Wall32 strips, props). */
function hasTemplateFootprints(map) {
  return Boolean(map?.templatePiecePlacements?.length)
}

// Precomputed body-clear centres + 8-neighbour edge bits for Template Piece maps.
// Built once per placements array so formation walkingDistances / A* stay O(1) per edge
// instead of re-sampling every Wall32 footprint on every BFS expansion (was tanking playtest FPS).
const navGraphCache = new WeakMap()

function templateNavGraph(map) {
  if (!hasTemplateFootprints(map)) return null
  const placements = map.templatePiecePlacements
  const epoch = templatePieceCatalogueEpochOf()
  const cached = navGraphCache.get(placements)
  if (cached && cached.epoch === epoch && cached.w === map.width && cached.h === map.height) return cached

  const w = map.width
  const h = map.height
  const centreOk = new Uint8Array(w * h)
  const edges = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(map, x, y)) continue
      if (isClear(map, { x, y })) centreOk[y * w + x] = 1
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!centreOk[y * w + x]) continue
      let bits = 0
      for (let d = 0; d < NEIGHBOURS.length; d++) {
        const [dx, dy] = NEIGHBOURS[d]
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        if (!centreOk[ny * w + nx]) continue
        if (dx && dy && (solid(map, x + dx, y) || solid(map, x, y + dy))) continue
        if (!isClearLine(map, { x, y }, { x: nx, y: ny })) continue
        bits |= 1 << d
      }
      edges[y * w + x] = bits
    }
  }
  const graph = { epoch, w, h, centreOk, edges }
  navGraphCache.set(placements, graph)
  return graph
}

/**
 * Tile centres used as A* nodes must be body-clear, not merely non-solid.
 * templateWall underlay is walkable for blocksMovement, but a south/east strip can still
 * block the centre of the cell below/beside it — those nodes must drop out of the graph.
 */
function tileCentreWalkable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false
  const graph = templateNavGraph(map)
  if (!graph) return !solid(map, x, y)
  return graph.centreOk[y * graph.w + x] === 1
}

/** Neighbour step for the tile graph: corner-cut rule + continuous clearance when pieces exist. */
function canStepTo(map, x, y, dirIndex) {
  const [dx, dy] = NEIGHBOURS[dirIndex]
  const graph = templateNavGraph(map)
  if (!graph) {
    const nx = x + dx
    const ny = y + dy
    if (solid(map, nx, ny)) return false
    if (dx && dy && (solid(map, x + dx, y) || solid(map, x, y + dy))) return false
    return true
  }
  return (graph.edges[y * graph.w + x] & (1 << dirIndex)) !== 0
}

// True when a circle of radius r at point overlaps no solid tile and no Template Piece wall strip.
// Tile (tx, ty) covers tx - 0.5 .. tx + 0.5.
export function isClear(map, point, r = RADIUS) {
  for (let ty = Math.round(point.y - r); ty <= Math.round(point.y + r); ty++) {
    for (let tx = Math.round(point.x - r); tx <= Math.round(point.x + r); tx++) {
      if (!solid(map, tx, ty)) continue
      const dx = point.x - Math.min(Math.max(point.x, tx - 0.5), tx + 0.5)
      const dy = point.y - Math.min(Math.max(point.y, ty - 0.5), ty + 0.5)
      if (dx * dx + dy * dy < r * r) return false
    }
  }
  // Edge collision for Template Pieces (and any empty wall underlay that is no longer full-cell solid).
  if (circleHitsTemplateWalls(map, point, r)) return false
  return true
}

// Whether a character could walk the straight line from a to b without touching a solid tile.
export function isClearLine(map, a, b, r = RADIUS) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / SAMPLE_STEP))
  for (let i = 1; i <= steps; i++) {
    if (!isClear(map, { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }, r)) return false
  }
  return true
}

// The farthest point along a -> b a character could walk to before touching a solid tile.
export function clearUpTo(map, a, b, r = RADIUS) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / SAMPLE_STEP))
  let last = a
  for (let i = 1; i <= steps; i++) {
    const point = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }
    if (!isClear(map, point, r)) return last
    last = point
  }
  return b
}

/**
 * Body circle plus optional forward samples (mounted neck/head). facing: {x,y} world direction.
 */
export function isClearFacing(map, point, facing, bodyR = RADIUS, noseReach = 0) {
  if (!isClear(map, point, bodyR)) return false
  if (!(noseReach > 0)) return true
  const len = Math.hypot(facing?.x ?? 0, facing?.y ?? 0)
  if (len < 1e-6) return true
  const fx = facing.x / len
  const fy = facing.y / len
  // Tip samples stay near foot width so the neck doesn't catch every nearby object;
  // the body circle still keeps the barrel off walls.
  const noseR = Math.min(RADIUS * 1.05, bodyR * 0.7)
  for (const t of [0.55, 1]) {
    if (!isClear(map, { x: point.x + fx * noseReach * t, y: point.y + fy * noseReach * t }, noseR)) return false
  }
  return true
}

/**
 * Nudge a body that already overlaps a solid / Template strip back into clear space.
 * Old behaviour free-moved while overlapping, which let Wall32 playtest phase through bulkheads
 * after a separation shove or a jam against a 32px strip.
 */
function unstick(map, from, delta, clearAt) {
  const candidates = [
    { x: from.x + delta.x, y: from.y + delta.y },
    { x: from.x + delta.x, y: from.y },
    { x: from.x, y: from.y + delta.y },
  ]
  for (const point of candidates) {
    if (clearAt(point)) return point
  }
  const span = Math.max(RADIUS, Math.hypot(delta.x, delta.y), 0.2)
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4
    const point = { x: from.x + Math.cos(angle) * span, y: from.y + Math.sin(angle) * span }
    if (clearAt(point)) return point
  }
  // Prefer backing out opposite the intended step when a long body is jammed into a wall.
  const backLen = Math.hypot(delta.x, delta.y)
  if (backLen > 1e-6) {
    for (const dist of [0.35, 0.7, 1.1, 1.5]) {
      const point = { x: from.x - (delta.x / backLen) * dist, y: from.y - (delta.y / backLen) * dist }
      if (clearAt(point)) return point
    }
  }
  const tile = nearestWalkableTile(map, from)
  if (tile && clearAt(tile)) return { x: tile.x, y: tile.y }
  return from
}

/**
 * Moves by delta one axis at a time, so a character pressed against a wall slides along it instead of stopping.
 * opts: { radius, facing, noseReach } — mounted horses pass a wider body + forward nose clearance.
 */
export function slide(map, from, delta, opts = {}) {
  const r = opts.radius ?? RADIUS
  const facing = opts.facing ?? null
  const noseReach = opts.noseReach ?? 0
  const clearAt = (point) =>
    facing && noseReach > 0 ? isClearFacing(map, point, facing, r, noseReach) : isClear(map, point, r)
  const dest = { x: from.x + delta.x, y: from.y + delta.y }
  if (clearAt(dest)) return dest
  if (clearAt({ x: dest.x, y: from.y })) return { x: dest.x, y: from.y }
  if (clearAt({ x: from.x, y: dest.y })) return { x: from.x, y: dest.y }
  if (!clearAt(from)) return unstick(map, from, delta, clearAt)
  return from
}

// The walkable tile nearest to a point (the point's own tile when its centre is body-clear).
export function nearestWalkableTile(map, point) {
  const centre = tileOf(point)
  const maxRing = Math.max(map.width, map.height)
  for (let ring = 0; ring <= maxRing; ring++) {
    let best = null
    for (let y = centre.y - ring; y <= centre.y + ring; y++) {
      for (let x = centre.x - ring; x <= centre.x + ring; x++) {
        if (Math.max(Math.abs(x - centre.x), Math.abs(y - centre.y)) !== ring) continue
        if (!tileCentreWalkable(map, x, y)) continue
        const d = distance(point, { x, y })
        if (!best || d < best.d) best = { x, y, d }
      }
    }
    if (best) return { x: best.x, y: best.y }
  }
  return centre
}

// Minimal binary heap of [priority, key].
function push(heap, item) {
  heap.push(item)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heap[parent][0] <= heap[i][0]) break
    ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
    i = parent
  }
}
function pop(heap) {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length) {
    heap[0] = last
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let smallest = i
      if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l
      if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r
      if (smallest === i) break
      ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
      i = smallest
    }
  }
  return top
}

// A* over body-clear tile centres (8 directions; no solid corner cuts; Template Piece strips
// block edges via isClearLine). When the goal can't be reached, ends at the reachable tile
// closest to it. Returns the tiles from start to the end, inclusive.
export function findTilePath(map, start, goal) {
  const key = (x, y) => y * map.width + x
  const heuristic = (x, y) => {
    const dx = Math.abs(x - goal.x)
    const dy = Math.abs(y - goal.y)
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)
  }
  const startKey = key(start.x, start.y)
  const cost = new Map([[startKey, 0]])
  const previous = new Map()
  const heap = [[heuristic(start.x, start.y), startKey]]
  let closest = { key: startKey, h: heuristic(start.x, start.y) }
  while (heap.length) {
    const [, current] = pop(heap)
    const x = current % map.width
    const y = Math.floor(current / map.width)
    if (x === goal.x && y === goal.y) {
      closest = { key: current, h: 0 }
      break
    }
    const h = heuristic(x, y)
    if (h < closest.h) closest = { key: current, h }
    for (let d = 0; d < NEIGHBOURS.length; d++) {
      if (!canStepTo(map, x, y, d)) continue
      const [dx, dy, step] = NEIGHBOURS[d]
      const nx = x + dx
      const ny = y + dy
      const nextKey = key(nx, ny)
      const nextCost = cost.get(current) + step
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue
      cost.set(nextKey, nextCost)
      previous.set(nextKey, current)
      push(heap, [nextCost + heuristic(nx, ny), nextKey])
    }
  }
  const tiles = []
  for (let k = closest.key; k !== undefined; k = previous.get(k)) tiles.unshift({ x: k % map.width, y: Math.floor(k / map.width) })
  return tiles
}

// Walking distance (in tiles) from one tile to every tile, as a Float32Array indexed y * width + x (Infinity =
// unreachable, or farther than `limit`: the search stops there, as on a big open map a whole-map search each time the
// leader steps onto a new tile stalls the game). Cached per map, start tile and limit, because followers ask about the
// same leader tile every frame.
const FIELD_CACHE_SIZE = 64
const fieldCache = new WeakMap()
export function walkingDistances(map, from, limit = Infinity) {
  let cache = fieldCache.get(map)
  if (!cache) fieldCache.set(map, (cache = new Map()))
  const cacheKey = `${from.x},${from.y},${limit}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const field = new Float32Array(map.width * map.height).fill(Infinity)
  if (tileCentreWalkable(map, from.x, from.y)) {
    field[from.y * map.width + from.x] = 0
    const heap = [[0, from.y * map.width + from.x]]
    while (heap.length) {
      const [cost, current] = pop(heap)
      if (cost > field[current]) continue
      const x = current % map.width
      const y = Math.floor(current / map.width)
      for (let d = 0; d < NEIGHBOURS.length; d++) {
        if (!canStepTo(map, x, y, d)) continue
        const [dx, dy, step] = NEIGHBOURS[d]
        const nx = x + dx
        const ny = y + dy
        const next = ny * map.width + nx
        if (cost + step >= field[next] || cost + step > limit) continue
        field[next] = cost + step
        push(heap, [cost + step, next])
      }
    }
  }
  if (cache.size >= FIELD_CACHE_SIZE) cache.delete(cache.keys().next().value)
  cache.set(cacheKey, field)
  return field
}

export const walkingDistanceTo = (map, field, point) => {
  const { x, y } = tileOf(point)
  return x >= 0 && y >= 0 && x < map.width && y < map.height ? field[y * map.width + x] : Infinity
}

// Drops waypoints the character can skip by walking straight, so routes cut across rooms instead of zig-zagging.
function straighten(map, from, points, r = RADIUS) {
  const result = []
  let current = from
  let i = 0
  while (i < points.length) {
    let j = points.length - 1
    while (j > i && !isClearLine(map, current, points[j], r)) j--
    result.push(points[j])
    current = points[j]
    i = j + 1
  }
  return result
}

// The waypoints from a position to a target point. Ends on the target itself when it is reachable and clear, otherwise on
// the centre of the nearest reachable walkable tile (so a click on a wall walks up to it).
export function planRoute(map, from, target, r = RADIUS) {
  if (isClearLine(map, from, target, r)) return [target]
  const fromTile = tileOf(from)
  const start = tileCentreWalkable(map, fromTile.x, fromTile.y) ? fromTile : nearestWalkableTile(map, from)
  const goal = nearestWalkableTile(map, target)
  const tiles = findTilePath(map, start, goal)
  const end = tiles[tiles.length - 1]
  const reached = end.x === goal.x && end.y === goal.y
  const points = tiles.slice(1)
  const finish = reached && isClear(map, target, r) ? target : end
  if (points.length) points[points.length - 1] = finish
  else points.push(finish)
  return straighten(map, from, points, r)
}
