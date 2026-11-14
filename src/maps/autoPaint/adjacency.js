// Per-ruleset adjacency: which wall may sit next to which wall / floor.
// Empty lists = allow all (legacy behaviour). Non-empty = whitelist only.

function cleanId(id) {
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** @returns {{ a: string, b: string }[]} */
export function normalizeWallWallPairs(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    let a = cleanId(entry.a ?? entry.from ?? entry.left)
    let b = cleanId(entry.b ?? entry.to ?? entry.right)
    if (!a || !b || a === b) continue
    if (a > b) [a, b] = [b, a]
    const key = pairKey(a, b)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ a, b })
  }
  return out
}

/** @returns {{ wall: string, floor: string }[]} */
export function normalizeWallFloorPairs(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const wall = cleanId(entry.wall ?? entry.a ?? entry.from)
    const floor = cleanId(entry.floor ?? entry.b ?? entry.to)
    if (!wall || !floor) continue
    const key = `${wall}|${floor}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ wall, floor })
  }
  return out
}

export function resolveAdjacency(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    wallWall: normalizeWallWallPairs(src.wallWall),
    wallFloor: normalizeWallFloorPairs(src.wallFloor),
  }
}

/** Empty whitelist = everything allowed. Same id always allowed (run of one piece). */
export function wallWallAllowed(adjacency, a, b) {
  const list = adjacency?.wallWall
  if (!list?.length) return true
  if (!a || !b) return true
  if (a === b) return true
  return list.some((pair) => (pair.a === a && pair.b === b) || (pair.a === b && pair.b === a))
}

export function wallFloorAllowed(adjacency, wallId, floorId) {
  const list = adjacency?.wallFloor
  if (!list?.length) return true
  if (!wallId || !floorId) return true
  return list.some((pair) => pair.wall === wallId && pair.floor === floorId)
}

/** True if candidate wall id is allowed beside all neighbor walls and at least one adjacent floor (when floors listed). */
export function wallCandidateAllowed(adjacency, wallId, { neighborWalls = [], floors = [] } = {}) {
  if (!wallId) return false
  for (const other of neighborWalls) {
    if (!other || other === wallId) continue
    if (!wallWallAllowed(adjacency, wallId, other)) return false
  }
  const floorList = floors.filter(Boolean)
  if (floorList.length && adjacency?.wallFloor?.length) {
    if (!floorList.some((floorId) => wallFloorAllowed(adjacency, wallId, floorId))) return false
  }
  return true
}

export function addWallWallPair(list, a, b) {
  return normalizeWallWallPairs([...(list ?? []), { a, b }])
}

export function removeWallWallPair(list, a, b) {
  const key = pairKey(a, b)
  return normalizeWallWallPairs(list).filter((pair) => pairKey(pair.a, pair.b) !== key)
}

export function addWallFloorPair(list, wall, floor) {
  return normalizeWallFloorPairs([...(list ?? []), { wall, floor }])
}

export function removeWallFloorPair(list, wall, floor) {
  return normalizeWallFloorPairs(list).filter((pair) => !(pair.wall === wall && pair.floor === floor))
}
