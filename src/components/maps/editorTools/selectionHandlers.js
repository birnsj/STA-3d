import { selectionCandidates } from '../../../maps/mapEdits.js'
import { canEditLayer, selectionPriority } from '../../../maps/layers.js'
import { isCharacterSpawnKind } from './toolHelpers.js'

// Click-to-select what stands on a tile, layer-aware, cycling on repeat clicks.
// ctx: the editor tools' shared state, setters and earlier handlers (see useEditorTools.js).
export function createSelectionHandlers(ctx) {
  const {
    clearSelectionModes, editingPatrol, itemGridSize, layers, map, movingWaypoint, objectDefinitions,
    onPatrolEdit, selectedDestructibleId, selectedFishingSpotId, selectedGroundItemId,
    selectedHazardId, selectedMarker, selectedNpcId, selectedObjectId, selectedTemplatePieceId,
    setEditingPatrol, setMovingWaypoint, setSelectedDestructibleId, setSelectedFishingSpotId,
    setSelectedGroundItemId, setSelectedHazardId, setSelectedMarker, setSelectedNpcId,
    setSelectedObjectId, setSelectedTemplatePieceId, setSelectedWaypointIndex,
  } = ctx

  const applyCandidate = (candidate, position) => {
    setSelectedNpcId(candidate?.kind === 'npc' ? candidate.npc.id : null)
    setSelectedMarker(
      isCharacterSpawnKind(candidate?.kind) ? { kind: candidate.kind, x: position.x, y: position.y } : null,
    )
    setSelectedObjectId(candidate?.kind === 'object' ? candidate.object.id : null)
    setSelectedDestructibleId(candidate?.kind === 'destructible' ? candidate.destructible.id : null)
    setSelectedHazardId(candidate?.kind === 'hazard' ? candidate.hazard.id : null)
    setSelectedGroundItemId(candidate?.kind === 'groundItem' ? candidate.groundItem.id : null)
    setSelectedTemplatePieceId(candidate?.kind === 'templatePiece' ? candidate.templatePiece.id : null)
    setSelectedFishingSpotId(candidate?.kind === 'fishingSpot' ? candidate.fishingSpot.id : null)
    if (candidate?.kind !== 'npc') {
      setEditingPatrol(false)
      setSelectedWaypointIndex(null)
      setMovingWaypoint(false)
    }
  }

  // A click with no marker tool held (Place Tiles and Move off): select what stands on the tile for editing.
  // Layer-aware: hidden/locked layers are skipped; active layer is preferred; repeat clicks cycle candidates.
  const selectAt = (position, boardPoint = null) => {
    if (editingPatrol || movingWaypoint) {
      if (onPatrolEdit(position)) return
    }
    clearSelectionModes()
    const all = selectionCandidates(map, objectDefinitions, position, { cellPx: itemGridSize, boardPoint })
    const editable = all.filter((candidate) => {
      if (!candidate.layer) return true
      return canEditLayer(layers, candidate.layer)
    })
    if (!editable.length) {
      applyCandidate(null, position)
      return
    }
    // Spawns / NPCs share a cell with the floor tile (and often furniture). First click always takes the spawn/NPC;
    // further clicks cycle (Move already prefers markers the same way).
    const characterCandidates = editable.filter(
      (candidate) => candidate.kind === 'npc' || isCharacterSpawnKind(candidate.kind),
    )
    const isCharacterSelected = characterCandidates.some((candidate) => {
      if (candidate.kind === 'npc') return candidate.npc.id === selectedNpcId
      return selectedMarker?.kind === candidate.kind && selectedMarker.x === position.x && selectedMarker.y === position.y
    })
    if (characterCandidates.length && !isCharacterSelected) {
      applyCandidate(characterCandidates[0], position)
      return
    }
    const drawnItem = editable.find((candidate) => candidate.kind === 'groundItem' || candidate.kind === 'templatePiece')
    if (boardPoint && drawnItem && !characterCandidates.length) {
      applyCandidate(drawnItem, position)
      return
    }
    const priority = selectionPriority(layers?.active)
    const ranked = [...editable].sort((a, b) => {
      const aChar = a.kind === 'npc' || isCharacterSpawnKind(a.kind)
      const bChar = b.kind === 'npc' || isCharacterSpawnKind(b.kind)
      if (aChar !== bChar) return aChar ? -1 : 1
      const ai = priority.indexOf(a.layer)
      const bi = priority.indexOf(b.layer)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
    // Cycle when the click is on the same tile as the current selection.
    const currentIndex = ranked.findIndex((candidate) => {
      if (candidate.kind === 'npc') return candidate.npc.id === selectedNpcId
      if (candidate.kind === 'object') return candidate.object.id === selectedObjectId
      if (candidate.kind === 'destructible') return candidate.destructible.id === selectedDestructibleId
      if (candidate.kind === 'hazard') return candidate.hazard.id === selectedHazardId
      if (candidate.kind === 'groundItem') return candidate.groundItem.id === selectedGroundItemId
      if (candidate.kind === 'templatePiece') return candidate.templatePiece.id === selectedTemplatePieceId
      if (candidate.kind === 'fishingSpot') return candidate.fishingSpot.id === selectedFishingSpotId
      if (isCharacterSpawnKind(candidate.kind)) {
        return selectedMarker?.kind === candidate.kind && selectedMarker.x === position.x && selectedMarker.y === position.y
      }
      return false
    })
    const next = ranked[(currentIndex + 1) % ranked.length]
    applyCandidate(next, position)
  }

  return { applyCandidate, selectAt }
}
