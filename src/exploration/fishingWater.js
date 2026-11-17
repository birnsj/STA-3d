// Water tiles that can host a Fishing Spot ripple (deep water or shallows).
// Keep this free of mapFormat imports so parse/serialize can use it without cycles.

export const FISHING_WATER_TILE_IDS = Object.freeze(['water', 'shallows'])

export function isFishingWaterTileId(tileId) {
  return FISHING_WATER_TILE_IDS.includes(tileId)
}

export function isFishingWaterAt(map, position) {
  if (!map || position?.x == null || position?.y == null) return false
  if (position.y < 0 || position.x < 0 || position.y >= map.height || position.x >= map.width) return false
  return isFishingWaterTileId(map.tiles[position.y][position.x])
}

/** Adjacent non-water walkable tile for casting from shore. Prefers the closest to the actor when from is set. */
export function shoreApproachTile(map, spotPos, from = null, { isWalkable } = {}) {
  if (!map || !spotPos) return null
  const walkable =
    isWalkable ??
    ((cell) => {
      const tileId = map.tiles[cell.y]?.[cell.x]
      if (tileId == null) return false
      // Avoid importing mapFormat: solid water is never a shore stand; empty / Null rejected by callers that pass isWalkable.
      if (isFishingWaterTileId(tileId)) return false
      return tileId !== 'null' && tileId !== 'Null'
    })
  const candidates = [
    { x: spotPos.x + 1, y: spotPos.y },
    { x: spotPos.x - 1, y: spotPos.y },
    { x: spotPos.x, y: spotPos.y + 1 },
    { x: spotPos.x, y: spotPos.y - 1 },
  ].filter((cell) => {
    if (cell.y < 0 || cell.x < 0 || cell.y >= map.height || cell.x >= map.width) return false
    return walkable(cell)
  })
  if (!candidates.length) return null
  if (!from) return candidates[0]
  return candidates.reduce((best, cell) => {
    const d = Math.hypot(cell.x - from.x, cell.y - from.y)
    const bd = Math.hypot(best.x - from.x, best.y - from.y)
    return d < bd ? cell : best
  })
}
