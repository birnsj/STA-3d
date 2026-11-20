import { useEffect } from 'react'
import {
  removeFishingSpot,
  removeGroundItem,
  removePatrolWaypoint,
  removeTemplatePiece,
} from '../../../maps/mapEdits.js'
import { LAYER_LABELS, canEditLayer, layerOfTemplatePiece } from '../../../maps/layers.js'

// Keyboard shortcuts for the editor tools.
// ctx: the editor tools' shared state, setters and handlers (see useEditorTools.js).
export default function useToolKeys(ctx) {
  const {
    duplicateSelected, duplicateSelectedGroundItem, edit, editingObjectCovers, editingPatrol, layers,
    linkingDestructible, map, moveFrom, movingDestructible, movingFishingSpot, movingGroundItem,
    movingTemplatePiece, movingWaypoint, onObjectivePlaced, placingFromEditor, placingObject,
    placingObjective, rotateBrushAxis, selectedDestructible, selectedFishingSpot, selectedGroundItem,
    selectedNpc, selectedTemplatePiece, selectedWaypointIndex, setEditingObjectCovers,
    setEditingPatrol, setLinkingDestructible, setMoveFrom, setMoving, setMovingDestructible,
    setMovingFishingSpot, setMovingGroundItem, setMovingNpc, setMovingTemplatePiece, setMovingWaypoint,
    setPlacing, setPlacingFromEditor, setPlacingObject, setPlacingObjective, setSelectedFishingSpotId,
    setSelectedGroundItemId, setSelectedTemplatePieceId, setSelectedWaypointIndex, setStatus, setTool,
    suspended,
  } = ctx

  // Escape puts the brush down (no tool selected, Place Tiles off), unless a popup is open (its own Escape cancels it)
  // or a text box has focus. R / Space rotate the tile brush axis (Space also via useCamera → onRotateAxis).
  useEffect(() => {
    if (suspended) return undefined
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, select')) return
      if ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey)) {
        if (selectedGroundItem) {
          event.preventDefault()
          duplicateSelectedGroundItem()
          return
        }
        if (!selectedDestructible) return
        event.preventDefault()
        return duplicateSelected()
      }
      if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        rotateBrushAxis()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && editingPatrol && selectedNpc && selectedWaypointIndex != null) {
        event.preventDefault()
        if (!canEditLayer(layers, 'characters')) return setStatus('NPCs / Characters layer is locked or hidden.')
        edit(removePatrolWaypoint(map, selectedNpc.id, selectedWaypointIndex))
        setSelectedWaypointIndex(null)
        setMovingWaypoint(false)
        setStatus('Removed patrol waypoint.')
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTemplatePiece) {
        event.preventDefault()
        const deleteLayer = layerOfTemplatePiece(selectedTemplatePiece.pieceId)
        if (!canEditLayer(layers, deleteLayer)) {
          return setStatus(`${LAYER_LABELS[deleteLayer] ?? deleteLayer} layer is locked or hidden.`)
        }
        edit(removeTemplatePiece(map, selectedTemplatePiece.id))
        setSelectedTemplatePieceId(null)
        setMovingTemplatePiece(false)
        setStatus(`Removed ${selectedTemplatePiece.id}.`)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGroundItem) {
        event.preventDefault()
        if (!canEditLayer(layers, 'furniture')) return setStatus('Furniture / Scenery layer is locked or hidden.')
        edit(removeGroundItem(map, selectedGroundItem.id))
        setSelectedGroundItemId(null)
        setMovingGroundItem(false)
        setStatus(`Removed ${selectedGroundItem.id}.`)
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedFishingSpot) {
        event.preventDefault()
        if (!canEditLayer(layers, 'markers')) return setStatus('Markers / Triggers layer is locked or hidden.')
        edit(removeFishingSpot(map, selectedFishingSpot.id))
        setSelectedFishingSpotId(null)
        setMovingFishingSpot(false)
        setStatus(`Removed ${selectedFishingSpot.id}.`)
        return
      }
      if (event.key !== 'Escape') return
      if (movingWaypoint) return setMovingWaypoint(false)
      if (editingPatrol) {
        setEditingPatrol(false)
        setSelectedWaypointIndex(null)
        return
      }
      if (linkingDestructible) return setLinkingDestructible(false)
      if (movingDestructible) return setMovingDestructible(false)
      if (movingGroundItem) return setMovingGroundItem(false)
      if (movingTemplatePiece) return setMovingTemplatePiece(false)
      if (movingFishingSpot) return setMovingFishingSpot(false)
      if (placingObject) return setPlacingObject(false)
      if (editingObjectCovers) return setEditingObjectCovers(false)
      if (placingObjective !== null) {
        if (placingFromEditor) onObjectivePlaced(placingObjective)
        setPlacingObjective(null)
        setPlacingFromEditor(false)
        return
      }
      // Move: Esc puts a carried object back without placing, then turns the tool off.
      if (moveFrom) {
        setMoveFrom(null)
        setStatus('Move cancelled.')
        return
      }
      setTool(null)
      setPlacing(false)
      setMoving(false)
      setMoveFrom(null)
      setMovingNpc(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}
