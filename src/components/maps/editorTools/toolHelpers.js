import { ambientMarkerKinds } from '../../../data/adaptation/exploration/ambientCreatures.js'
import { layerOfTile } from '../../../maps/layers.js'
import { PALETTE_GROUPS, cellKey } from '../../../maps/mapFormat.js'
import { templatePieceGroups } from '../../../maps/templatePieces.js'

const CHARACTER_SPAWN_KINDS = ['playerStarts', 'enemySpawns', 'horseSpawns', ...ambientMarkerKinds()]
const isCharacterSpawnKind = (kind) => CHARACTER_SPAWN_KINDS.includes(kind)

// Checked palette tiles for Place Tiles (Unreal foliage-style multi-brush). Palette order, then leftovers.
function orderedPaintTileIds(selectedIds) {
  const wanted = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  if (!wanted.size) return []
  const ordered = []
  const seen = new Set()
  for (const group of PALETTE_GROUPS) {
    for (const id of group.tiles ?? []) {
      if (!wanted.has(id) || seen.has(id)) continue
      ordered.push(id)
      seen.add(id)
    }
  }
  for (const id of wanted) {
    if (seen.has(id)) continue
    ordered.push(id)
    seen.add(id)
  }
  return ordered
}

// Same multi-brush ordering for Template Pieces (catalogue group order).
function orderedPaintTemplateIds(selectedIds) {
  const wanted = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  if (!wanted.size) return []
  const ordered = []
  const seen = new Set()
  for (const group of templatePieceGroups()) {
    for (const piece of group.pieces ?? []) {
      if (!wanted.has(piece.id) || seen.has(piece.id)) continue
      ordered.push(piece.id)
      seen.add(piece.id)
    }
  }
  for (const id of wanted) {
    if (seen.has(id)) continue
    ordered.push(id)
    seen.add(id)
  }
  return ordered
}

function markerLayersAt(map, position) {
  const layers = new Set()
  if (
    (map.npcs ?? []).some((npc) => npc.position.x === position.x && npc.position.y === position.y) ||
    CHARACTER_SPAWN_KINDS.flatMap((kind) => map.markers?.[kind] ?? []).some(
      (marker) => marker.x === position.x && marker.y === position.y,
    )
  ) {
    layers.add('characters')
  }
  if (
    (map.areas ?? []).some((area) => area.position.x === position.x && area.position.y === position.y) ||
    (map.objectives ?? []).some((objective) => objective.position?.x === position.x && objective.position?.y === position.y)
  ) {
    layers.add('markers')
  }
  return [...layers]
}

function cellAssemblyLayers(map, position, objectDefinitions) {
  const layers = new Set([layerOfTile(map.tiles[position.y][position.x])])
  const key = cellKey(position)
  if (map.floorUnder?.[key] != null) layers.add('ground')
  if (map.stackOver?.[key]?.length) layers.add('furniture')
  if (objectDefinitions.some((definition) => definition.position[0] === position.x && definition.position[1] === position.y)) {
    layers.add('furniture')
  }
  if (
    (map.groundItemPlacements ?? []).some((entry) => {
      const tile = entry.on?.tile
      return Array.isArray(tile) && tile[0] === position.x && tile[1] === position.y
    })
  ) {
    layers.add('furniture')
  }
  return [...layers]
}

export { CHARACTER_SPAWN_KINDS, isCharacterSpawnKind, orderedPaintTileIds, orderedPaintTemplateIds, markerLayersAt, cellAssemblyLayers }
